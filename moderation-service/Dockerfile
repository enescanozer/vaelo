# Vaelo moderasyon compute servisi — hafif Python + ffmpeg (kare çıkarma) + transformers.
FROM python:3.11-slim

# ffmpeg: source_url'den sahne-değişimi kare örneklemesi için (Stream thumbs yoksa).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# CPU torch (daha küçük imaj). GPU gerekmez.
RUN pip install --no-cache-dir torch==2.* --index-url https://download.pytorch.org/whl/cpu \
  && pip install --no-cache-dir -r requirements.txt

COPY . .

# Soğuk başlatta model indirmesin diye ağırlıkları imaja göm (opsiyonel ama önerilir):
RUN python -c "from transformers import pipeline; pipeline('image-classification', model='Falconsai/nsfw_image_detection')" || true

ENV PORT=8080
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
