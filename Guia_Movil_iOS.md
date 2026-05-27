# Guía Paso a Paso: Cómo Probar la App en tu Móvil iOS (iPhone / iPad) con HTTPS Seguro

Dado que **Manza AutoGerma Import** cuenta con un diseño web móvil *responsive* de calidad ultra-premium (efectos de glassmorphism, barras de estado dinámicas, sliders fluidos y transiciones táctiles), la mejor forma de experimentar su potencial es directamente en la pantalla de tu **iPhone** o **iPad**.

Hemos configurado un **servidor local HTTPS seguro** dinámico en tu sesión para cumplir con los estrictos requisitos de seguridad de Apple (iOS 13+ y Safari), asegurando que todas las funcionalidades y peticiones de datos se carguen sin bloqueos y sin almacenar caché antigua.

---

## 📋 Requisito Obligatorio
* **Misma Red Wi-Fi:** Tu ordenador con Windows y tu iPhone/iPad deben estar conectados exactamente a la **misma red Wi-Fi** (el mismo router de casa).

---

## 🛠️ Paso 1: Obtener la dirección IP local de tu ordenador

1. En tu ordenador con Windows, haz clic en el botón de **Inicio** (o presiona la tecla `Windows`).
2. Escribe **`PowerShell`** y ábrelo.
3. En la ventana que se abre, escribe el siguiente comando y presiona **Enter**:
   ```powershell
   ipconfig
   ```
4. Busca la sección llamada **Adaptador de LAN inalámbrica Wi-Fi** (o *Wireless LAN adapter Wi-Fi*).
5. Localiza la línea que dice **Dirección IPv4** (o *IPv4 Address*). Verás una numeración similar a esta:
   > `192.168.1.43` (o `192.168.0.X`, `10.0.0.X`, etc.)
6. **Apunta esa dirección IP** (la utilizaremos en el Paso 3).

---

## 🚀 Paso 2: Iniciar el Servidor HTTPS Seguro en Windows

Hemos preparado un script de servidor HTTPS seguro en Python que utiliza certificados SSL dinámicos auto-firmados específicos para tu IP y desactiva la caché del navegador para cargar los últimos cambios de inmediato.

1. Abre una ventana de **PowerShell**.
2. Copia y pega el siguiente comando para situarte en la carpeta de la aplicación y presiona **Enter**:
   ```powershell
   cd "C:\Users\nacho\OneDrive\Documentos\Import Germany app project\autoimport"
   ```
3. Ejecuta el servidor seguro escribiendo esto y presionando **Enter**:
   ```powershell
   python serve_https.py
   ```
4. Verás un panel en pantalla indicando que el servidor web seguro está listo y transmitiendo.

> [!IMPORTANT]
> **¡No cierres esta ventana de PowerShell!** Debes mantener el servidor de PowerShell abierto mientras estés probando la aplicación en tu iPhone.

---

## 📱 Paso 3: Abrir la aplicación desde tu iPhone o iPad en modo Seguro (HTTPS)

1. Coge tu **iPhone** o **iPad** y asegúrate de que tiene el Wi-Fi activado en la red de tu casa.
2. Abre **Safari** o **Chrome**.
3. En la barra de direcciones de arriba, escribe **`https://`** seguido de la dirección IP de tu ordenador (la del Paso 1) y el puerto **`:8000`**.
   * *Por ejemplo:* Si tu dirección IPv4 era `192.168.1.43`, escribe exactamente esto:
     ```text
     https://192.168.1.43:8000
     ```
   > [!WARNING]
   > Asegúrate de escribir obligatoriamente **`https://`** al principio de la dirección.

4. **Saltar la advertencia de certificado local en el iPhone:**
   Al ser un certificado auto-firmado de desarrollo local propio (no comprado a una entidad emisora externa):
   * **En Safari:** Verás una pantalla que dice *"Esta conexión no es privada"*. Pulsa en **"Mostrar detalles"** en la parte inferior y luego selecciona **"Visitar este sitio web"**.
   * **En Chrome:** Verás *"La conexión no es privada"*. Pulsa en **"Configuración avanzada"** y luego en **"Acceder a <tu IP> (no seguro)"**.
   * *¡Esto es 100% seguro al ser tu propia red de casa local y privada!*
5. ¡Listo! Verás la interfaz de **Manza AutoGerma Import** cargarse al instante con los cambios de hoy y un rendimiento táctil óptimo.

---

## ✨ Nivel Experto: Instalarla como una App Nativa en tu Pantalla de Inicio

Para eliminar por completo las barras de navegación de Safari (superior e inferior) y disfrutar de una experiencia a pantalla completa como si fuese una app nativa:

1. Con la aplicación abierta en **Safari**, pulsa el botón **Compartir** (el icono del cuadrado con una flecha hacia arriba).
2. Selecciona la opción **"Añadir a la pantalla de inicio"** (o *Add to Home Screen*).
3. Nómbrala como prefieras (por ejemplo: **`AutoGerma`**) y pulsa **Añadir**.
4. Se creará un acceso directo con el logotipo de la aplicación directamente en la pantalla de inicio de tu iPhone.
5. Al abrir este acceso directo, la app se iniciará en **pantalla completa táctil**, ofreciendo una experiencia inmersiva espectacular.

---

## 🛑 Paso 4: Apagar el Servidor al terminar

Cuando hayas terminado tus pruebas y quieras cerrar el servidor en tu ordenador:

1. Ve a la ventana de **PowerShell** en tu ordenador Windows.
2. Presiona la combinación de teclas **`Ctrl` + `C`** para detener el servidor.
3. Ya puedes cerrar la ventana de PowerShell de forma segura.
