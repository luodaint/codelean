"""Private bounded static scanner. Never executes repository code or shell commands."""
import hmac
import json
import os
import pathlib
import signal
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("SCANNER_TOKEN", "")
LOCK = threading.Lock()


def valid_path(value):
    return (isinstance(value, str) and 0 < len(value) <= 500
            and not value.startswith("/") and "\\" not in value
            and all(part not in ("", ".", "..", ".git") for part in value.split("/"))
            and not any(ord(char) < 32 for char in value)
            and pathlib.PurePosixPath(value).name not in (".semgrepignore", ".gitleaksignore"))


def command(args, cwd, home):
    # The subprocess receives neither the service token nor inherited host secrets.
    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "HOME": str(home),
           "TMPDIR": str(home), "SEMGREP_SEND_METRICS": "off", "SEMGREP_ENABLE_VERSION_CHECK": "0"}
    # Output goes to a bounded temporary filesystem, not an unbounded RAM pipe.
    with tempfile.TemporaryFile() as output:
        proc = subprocess.Popen(args, cwd=cwd, env=env, stdout=output, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            code = proc.wait(timeout=100)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            raise ValueError("Scanner timed out")
        output.seek(0)
        result = output.read(2_000_001)
    if len(result) > 2_000_000:
        raise ValueError("Scanner output exceeded the limit")
    if code not in (0, 1):
        raise ValueError("Scanner failed")
    return result


def scan(files):
    if not isinstance(files, list) or not 1 <= len(files) <= 30:
        raise ValueError("Expected 1 to 30 files")
    seen = set()
    size = 0
    for file in files:
        if not isinstance(file, dict) or not valid_path(file.get("path")) or file["path"] in seen:
            raise ValueError("Invalid or duplicate path")
        if not isinstance(file.get("content"), str) or not isinstance(file.get("patch"), str):
            raise ValueError("Invalid source")
        size += len(file["content"].encode()) + len(file["patch"].encode())
        if len(file["content"].encode()) > 100_000 or size > 1_500_000:
            raise ValueError("Source limit exceeded")
        seen.add(file["path"])
    with tempfile.TemporaryDirectory(prefix="luoda-") as temp:
        root = pathlib.Path(temp)
        source = root / "source"
        source.mkdir()
        for file in files:
            dest = source / file["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(file["content"])
            dest.chmod(0o444)
        leaks = root / "leaks.json"
        command(["gitleaks", "dir", str(source), "--config", "/app/gitleaks.toml", "--report-format", "json",
                 "--report-path", str(leaks), "--no-banner", "--ignore-gitleaks-allow", "--max-target-megabytes", "1"], root, root)
        if not leaks.exists() or leaks.stat().st_size > 2_000_000:
            raise ValueError("Missing or oversized secret scan report")
        leak_results = json.loads(leaks.read_text()) or []
        semgrep = json.loads(command(["semgrep", "scan", "--config", "/app/rules.yml", "--json", "--quiet",
            "--metrics=off", "--disable-version-check", "--no-git-ignore", "--jobs", "1", "--timeout", "10", "--max-memory", "768", str(source)], root, root))
        if semgrep.get("errors"):
            raise ValueError("Semgrep could not analyze all supplied files")
        secrets = [f.get("Secret", "") for f in leak_results if f.get("Secret")]
        def clean(value):
            for secret in secrets:
                value = value.replace(secret, "\n".join("[REDACTED]" for _ in secret.split("\n")))
            return value
        def relative(value):
            path = pathlib.Path(value)
            if path.is_absolute():
                path = path.relative_to(source)
            result = str(path)
            if result not in seen:
                raise ValueError("Scanner returned an unknown path")
            return result
        findings = []
        for leak in leak_results:
            findings.append({"source": "gitleaks", "severity": "high", "path": relative(leak["File"]),
                "line": leak["StartLine"], "title": "Potential credential in source",
                "description": "Secret detection matched a credential pattern. The value has been removed from this report.",
                "evidence": "[REDACTED]", "recommendation": "Verify the finding, revoke exposed credentials, and load secrets from protected configuration."})
        for finding in semgrep.get("results", []):
            findings.append({"source": "semgrep", "severity": "medium", "path": relative(finding["path"]),
                "line": finding["start"]["line"], "title": clean(finding["extra"]["message"])[:180],
                "description": "A bundled static rule matched this code. Check whether untrusted input can reach the operation.",
                "evidence": "Static rule: " + finding["check_id"], "recommendation": "Use a safe API and validate the trust boundary."})
        warnings = []
        if any(pathlib.Path(f["path"]).suffix not in (".js", ".jsx", ".ts", ".tsx", ".py") for f in files):
            warnings.append("Bundled Semgrep rules cover JavaScript, TypeScript, and Python only; other files receive secret detection and AI review.")
        return {"files": [{"path": f["path"], "content": clean(f["content"]), "patch": clean(f["patch"])} for f in files],
                "findings": findings[:100], "warnings": warnings + (["Static findings were capped at 100."] if len(findings) > 100 else []),
                "scanners": ["Gitleaks 8.30.1", "Semgrep 1.178.0 (bundled rules)"]}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == "/health" else 404, {"status": "ready"})

    def do_POST(self):
        if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            return self.respond(401, {"error": "Unauthorized"})
        if self.path != "/scan":
            return self.respond(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.respond(400, {"error": "Invalid length"})
        if not 0 < length <= 2_000_000:
            return self.respond(413, {"error": "Request too large"})
        if not LOCK.acquire(blocking=False):
            return self.respond(429, {"error": "Scanner busy"})
        try:
            self.connection.settimeout(15)
            data = json.loads(self.rfile.read(length))
            self.respond(200, scan(data.get("files")))
        except Exception:
            # Raw tool errors may contain source or credentials.
            self.respond(422, {"error": "Scan failed or input was invalid; no clean result was produced"})
        finally:
            LOCK.release()


if __name__ == "__main__":
    if len(TOKEN) < 32:
        raise SystemExit("SCANNER_TOKEN must have at least 32 characters")
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
