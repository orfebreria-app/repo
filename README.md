# FacturaApp 🧾
> App de facturación online gratuita · React + Vite + Supabase

**100% gratis · Sin instalar nada · Accesible desde cualquier navegador**

---

## 🚀 Puesta en marcha (30 minutos)

### Paso 1 — Crear base de datos en Supabase (gratis)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta (gratis)
2. Crea un nuevo proyecto
3. Ve a **SQL Editor → New Query**
4. Pega el contenido de `supabase/schema.sql` y pulsa **Run**
5. Ve a **Settings → API** y copia:
   - `URL` → la necesitarás para `.env`
   - `anon public key` → la necesitarás para `.env`

### Paso 2 — Subir código a GitHub (gratis)

1. Ve a [github.com](https://github.com) y crea una cuenta (gratis)
2. Crea un repositorio nuevo (puede ser privado)
3. Sube esta carpeta al repositorio

```bash
git init
git add .
git commit -m "primera versión"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### Paso 3 — Desplegar en Vercel (gratis)

1. Ve a [vercel.com](https://vercel.com) y regístrate con tu cuenta de GitHub
2. Pulsa **Add New → Project**
3. Selecciona tu repositorio de GitHub
4. En **Environment Variables** añade:
   ```
   VITE_SUPABASE_URL      = https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGci...
   ```
5. Pulsa **Deploy** 🎉

Tu app estará disponible en: `https://tu-proyecto.vercel.app`

---

## 🛠 Desarrollo local

```bash
# 1. Clonar el repo
git clone https://github.com/TU_USUARIO/TU_REPO.git
cd facturacion-app

# 2. Instalar dependencias
npm install

# 3. Crear archivo de entorno
cp .env.example .env
# Edita .env y añade tus claves de Supabase

# 4. Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173)

---

## 📁 Estructura del proyecto

```
facturacion/
├── supabase/
│   └── schema.sql        ← SQL para crear las tablas
├── src/
│   ├── lib/
│   │   └── supabase.js   ← Cliente y helpers de Supabase
│   ├── components/
│   │   └── Layout.jsx    ← Sidebar + navegación
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Clientes.jsx
│   │   ├── Facturas.jsx
│   │   ├── NuevaFactura.jsx
│   │   └── Configuracion.jsx
│   ├── App.jsx           ← Router principal
│   ├── main.jsx          ← Punto de entrada
│   └── index.css         ← Estilos Tailwind
├── .env.example          ← Plantilla de variables de entorno
├── .gitignore
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## ✅ Funcionalidades incluidas (v1.0)

- [x] Registro e inicio de sesión (email + contraseña)
- [x] Configuración de empresa (nombre, NIF, dirección, serie, IVA)
- [x] Gestión de clientes (CRUD completo)
- [x] Creación de facturas con múltiples conceptos
- [x] Cálculo automático de IVA y totales
- [x] Estados de factura (borrador, emitida, pagada, vencida, cancelada)
- [x] Filtros y búsqueda de facturas
- [x] Dashboard con KPIs
- [x] Diseño responsive (funciona en móvil, tablet y PC)
- [x] Seguridad: cada usuario ve solo sus datos (Row Level Security)

## 🔜 Próximas funcionalidades (v2.0)

- [ ] Generación de PDF de factura
- [ ] Envío por email al cliente
- [ ] Módulo de gastos
- [ ] Reportes (Estado de resultados, IVA mensual)
- [ ] Conciliación bancaria básica

---

## 💰 Coste mensual

| Servicio | Plan | Coste |
|----------|------|-------|
| GitHub   | Free | 0 €   |
| Supabase | Free | 0 €   |
| Vercel   | Hobby | 0 €  |
| **Total** | | **0 €/mes** |

> Los planes gratuitos son más que suficientes para < 1.000 usuarios.

---

## 🆘 Soporte

¿Problemas con la configuración? Revisa:
- [Documentación Supabase](https://supabase.com/docs)
- [Documentación Vercel](https://vercel.com/docs)
