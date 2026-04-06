FROM node:20-slim

# Instalar dependencias necesarias para Google Chrome y Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    lsb-release \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Crear el directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencia
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto de la aplicación
COPY . .

# Variables de entorno por defecto
ENV PORT=8080
# Le decimos a Puppeteer que use el Chrome del sistema si es necesario, 
# aunque wwebjs suele traer el suyo, estas librerías lo hacen funcionar.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

EXPOSE 8080

CMD ["node", "index.js"]
