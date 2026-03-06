const express = require('express');
const nodemailer = require('nodemailer');
const { Client } = require('pg');
const { jsPDF } = require('jspdf');
const fs = require('fs');

const app = express();
app.use(express.json());

// Configuración de la base de datos Postgres (ajusta los datos de conexión)
const db = new Client({
  user: 'info@trofeosaka.es',
  host: 'smtp.dsmail.es',
  database: 'facturacion',
  password: '@Dlp73@Llp75',
  port: 5432,
});
db.connect();

// Configuración SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.dsmail.es',
  port: 465,
  secure: true,
  auth: {
    user: 'info@trofeosaka.es',
    pass: '@Dlp73@Llp75'
  }
});

// Endpoint para enviar factura por email
app.post('/enviar-factura/:id', async (req, res) => {
  const facturaId = req.params.id;
  try {
    // 1. Obtener datos de la factura y cliente
    const { rows } = await db.query(`
      select f.*, c.email as cliente_email, c.nombre as cliente_nombre
      from facturas f
      join clientes c on f.cliente_id = c.id
      where f.id = $1
    `, [facturaId]);
    if (!rows.length) return res.status(404).send('Factura no encontrada');
    const factura = rows[0];

    // 2. Generar PDF (ejemplo básico)
    const doc = new jsPDF();
    doc.text(`Factura: ${factura.folio}`, 10, 20);
    doc.text(`Cliente: ${factura.cliente_nombre}`, 10, 30);
    doc.text(`Total: ${factura.total} EUR`, 10, 40);
    const pdfPath = `./factura_${factura.folio}.pdf`;
    fs.writeFileSync(pdfPath, doc.output('arraybuffer'));

    // 3. Enviar email con PDF adjunto
    await transporter.sendMail({
      from: 'info@trofeosaka.es',
      to: factura.cliente_email,
      subject: `Factura ${factura.folio}`,
      text: 'Adjuntamos su factura en PDF.',
      attachments: [{ filename: `factura_${factura.folio}.pdf`, path: pdfPath }]
    });

    // 4. Eliminar PDF temporal
    fs.unlinkSync(pdfPath);

    res.send('Factura enviada correctamente');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al enviar la factura');
  }
});

app.listen(3001, () => {
  console.log('Servidor de envío de facturas iniciado en puerto 3001');
});