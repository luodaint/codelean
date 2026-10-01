FROM ghcr.io/gitleaks/gitleaks:v8.30.1 AS gitleaks
FROM python:3.14-slim-bookworm
RUN pip install --no-cache-dir semgrep==1.178.0
COPY --from=gitleaks /usr/bin/gitleaks /usr/local/bin/gitleaks
RUN useradd --uid 10001 --create-home scanner
WORKDIR /app
COPY server.py rules.yml gitleaks.toml ./
USER 10001:10001
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "server.py"]
