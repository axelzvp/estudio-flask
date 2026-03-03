import os


bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"

# Base recomendado para tu caso:
# 3 workers x 2 threads = 6 solicitudes concurrentes activas.
workers = int(os.getenv("WEB_CONCURRENCY", "3"))
threads = int(os.getenv("GUNICORN_THREADS", "2"))

timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))

# Reinicio preventivo para evitar fugas de memoria en procesos largos.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))

worker_tmp_dir = "/dev/shm" if os.path.exists("/dev/shm") else None
