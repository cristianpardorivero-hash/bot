# Hospital de Curepto - WhatsApp Bot (Dashboard)

Sistema de gestión de campañas masivas y seguimiento de citas médicas vía WhatsApp para el Hospital de Curepto.

## Estructura del Proyecto

- `client/`: Panel de control (React + Vite + Tailwind 2.0). 
- `server/`: Motor de WhatsApp y Servidor de Sockets (Node.js + Puppeteer).

## Configuración y Seguridad

> [!IMPORTANT]
> - **Firebase:** Se requiere el archivo `server/serviceAccountKey.json` para la autenticación y base de datos de usuarios.
> - **WhatsApp:** Al primer inicio, el sistema pedirá escanear un código QR desde el Dashboard. La sesión se mantendrá persistente en la carpeta local `.wwebjs_auth/`.

## Instrucciones de Instalación

1.  Clonar el repositorio:
    ```bash
    git clone https://github.com/TU-USUARIO/CureptoBot.git
    cd CureptoBot
    ```

2.  Instalar dependencias del Servidor:
    ```bash
    cd server
    npm install
    ```

3.  Instalar dependencias del Cliente (Dashboard):
    ```bash
    cd ../client
    npm install
    ```

4.  Iniciar en modo desarrollo:
    - **Backend:** `node index.js` (en la carpeta `server`)
    - **Frontend:** `npm run dev` (en la carpeta `client`)

---

Desarrollado para el **Hospital de Curepto** por **Antigravity AI**.
