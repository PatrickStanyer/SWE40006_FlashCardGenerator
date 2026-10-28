# ---- Stage 1: resolve and build wheels ----
# Compilers and build headers stay in this stage so they never reach the
# runtime image, which keeps the Trivy surface small.
FROM python:3.11-slim-bookworm AS build

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
 && python -m pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# ---- Stage 2: lean runtime ----
FROM python:3.11-slim-bookworm

# Bring the base image's OS packages up to the patched versions, the same way
# the frontend image does. A base tag is built once and then falls behind every
# Debian security update published after it, which is how a fixed openssl
# advisory turned the image scan red without anything in this project changing.
# This runs before the unprivileged account exists, while the stage is root.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Unbuffered output so container logs reach docker logs immediately, and no
# .pyc files written into a filesystem the app user does not own.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Dedicated unprivileged account. Running as root would fail the Trivy
# misconfiguration check and give a compromised process host-level reach.
RUN groupadd --system --gid 1001 appuser \
 && useradd --system --uid 1001 --gid appuser --no-create-home appuser

WORKDIR /app

COPY --from=build /wheels /wheels
COPY requirements.txt ./

# Installer tooling is build-time only. Removing pip, setuptools and wheel also
# removes the older copies setuptools vendors inside itself, which is what the
# image scan reports, and leaves nothing in the running container able to fetch
# and install new code.
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
 && python -m pip uninstall -y setuptools wheel \
 && python -m pip uninstall -y pip \
 && rm -rf /wheels \
           /usr/local/lib/python3.11/ensurepip \
           /usr/local/lib/python3.11/site-packages/pkg_resources \
           /usr/local/lib/python3.11/site-packages/_distutils_hack \
           /usr/local/lib/python3.11/site-packages/distutils-precedence.pth

COPY --chown=appuser:appuser app ./app

USER appuser

EXPOSE 8000

# Mirrors the probe nginx and the CD smoke test use, so an unhealthy container
# is visible in docker ps before anyone opens the site.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz').read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
