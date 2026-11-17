FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py .

EXPOSE 8014
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8014"]
