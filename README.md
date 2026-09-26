# 📅 Sistema de Agenda Diaria y Control de Tickets Virtuales

Plataforma web integral diseñada para la recepción de reportes e incidencias mediante un enlace virtual público, con seguimiento en tiempo real para los solicitantes y una agenda diaria con tablero Kanban para el equipo gestor/administrador.

---

## 🚀 Características Principales

1. **Portal Público de Reportes (`/`)**:
   - Formulario ágil para registrar incidencias, soporte o solicitudes.
   - Generación instantánea de un **Código Único de Ticket** (ej: `TCK-2026-A101`).
   - Enlace directo copiable en 1 clic para compartir o guardar.

2. **Seguimiento en Tiempo Real (`/ticket/:id` y `/seguimiento`)**:
   - Barra de progreso visual interactiva:
     * 🟡 **Pendiente**
     * 🔵 **En Proceso**
     * 🟢 **Resuelto**
     * ⚪ **Cerrado**
   - Muro de comunicación bidireccional: el usuario puede leer respuestas oficiales y enviar aclaraciones o mensajes adicionales al equipo hasta el cierre del ticket.

3. **Agenda Diaria y Tablero Kanban (`/admin`)**:
   - Acceso protegido por **PIN de seguridad** (PIN inicial por defecto: `1234`).
   - Selector de fecha de Agenda Diaria (*Hoy*, *Ayer*, *Fecha personalizada en calendario* o *Ver todos*).
   - Métricas en tiempo real de tickets del día.
   - Tablero Kanban interactivo con 4 columnas y soporte de arrastrar y soltar (*drag-and-drop*).
   - Modal de gestión para responder al solicitante, añadir notas internas y cambiar de estado.
   - Exportación de reportes diarios en formato **CSV / Excel**.

---

## 🛠️ Cómo Iniciar el Proyecto

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
# 1. Instalar dependencias (solo la primera vez)
npm install

# 2. Iniciar el servidor
npm start
```

El sistema estará disponible inmediatamente en tu navegador:
* 🌐 **Portal Público (Crear reportes)**: [http://localhost:3000](http://localhost:3000)
* 🔍 **Buscador de Seguimiento**: [http://localhost:3000/seguimiento](http://localhost:3000/seguimiento)
* 🔒 **Panel Admin / Agenda Diaria**: [http://localhost:3000/admin](http://localhost:3000/admin) *(PIN: `1234`)*

---

## 🌐 Cómo Compartir el Enlace Virtual

- **En tu red local (oficina o casa)**:
  Cualquier persona conectada a tu misma red WiFi puede entrar usando tu IP local: `http://TU_IP_LOCAL:3000`
- **En Internet (Gratuito)**:
  Puedes desplegar este proyecto con 1 clic en plataformas como **Render**, **Railway**, **Fly.io** o **Glitch** subiendo este repositorio a GitHub.

---

## 📁 Estructura del Código

- `server.js` - Servidor backend Node.js / Express con todas las rutas y APIs REST.
- `db.js` - Módulo de persistencia JSON transaccional (cero dependencias complejas, 100% compatible con Windows).
- `data/` - Carpeta donde se almacenan automáticamente los tickets y la configuración.
- `public/` - Vistas y estilos de la aplicación:
  - `index.html` - Formulario de registro público.
  - `ticket.html` - Página de seguimiento en vivo con barra de progreso y chat.
  - `seguimiento.html` - Buscador por código de ticket.
  - `admin.html` - Panel administrativo con agenda diaria y tablero Kanban.
  - `css/style.css` - Diseño moderno responsivo.
  - `js/app.js` - Funciones compartidas (formateo de fechas, notificaciones toast, portapapeles).
