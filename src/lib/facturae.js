const escapeXml = (value) => {
  if (value === undefined || value === null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const fmtNumber = (value) => Number(value || 0).toFixed(2)
const fmtDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildFacturaEXML({ empresa, factura, cliente, conceptos }) {
  const issueDate = fmtDate(factura.fecha_emision)
  const dueDate = fmtDate(factura.fecha_vencimiento)
  const totalAmount = fmtNumber(factura.total)
  const currency = empresa?.moneda || 'EUR'
  const TaxIdentificationNumber = empresa?.nif_cif || ''
  const buyerTaxId = cliente?.nif_cif || ''
  const invoiceNumber = escapeXml(factura.folio || factura.id || '')
  const customerName = escapeXml(cliente?.nombre || '')
  const companyName = escapeXml(empresa?.nombre || '')
  const companyAddress = escapeXml(empresa?.direccion || '')
  const companyEmail = escapeXml(empresa?.email || '')
  const companyPhone = escapeXml(empresa?.telefono || '')
  const companyCity = escapeXml(empresa?.ciudad || '')
  const companyPostalCode = escapeXml(empresa?.cp || '')
  const companyCountry = escapeXml(empresa?.pais || 'España')

  const linesXml = (conceptos || []).map((concepto, index) => {
    const description = escapeXml(concepto.descripcion || '')
    const quantity = Number(concepto.cantidad || 0)
    const unitPrice = fmtNumber(concepto.precio_unitario)
    const taxRate = Number(concepto.iva_tasa || 0)
    const lineTotal = fmtNumber(concepto.subtotal)
    const taxAmount = fmtNumber((quantity * Number(concepto.precio_unitario || 0) - ((quantity * Number(concepto.precio_unitario || 0) * Number(concepto.descuento || 0)) / 100)) * taxRate / 100)

    return `        <InvoiceLine>
          <LineID>${index + 1}</LineID>
          <ItemDescription>${description}</ItemDescription>
          <Quantity>${quantity}</Quantity>
          <UnitPrice>${unitPrice}</UnitPrice>
          <TaxRate>${taxRate}</TaxRate>
          <LineAmount>${lineTotal}</LineAmount>
          <TaxAmount>${taxAmount}</TaxAmount>
        </InvoiceLine>`
  }).join('\n')

  const ivaGroups = []
  ;(conceptos || []).forEach((concepto) => {
    const rate = Number(concepto.iva_tasa || 0)
    const lineTotal = Number(concepto.subtotal || 0)
    const taxAmount = (lineTotal * rate) / 100
    const group = ivaGroups.find(g => g.rate === rate)
    if (group) {
      group.taxableBase += lineTotal
      group.taxAmount += taxAmount
    } else {
      ivaGroups.push({ rate, taxableBase: lineTotal, taxAmount })
    }
  })

  const taxesXml = ivaGroups.map((group, index) => `        <TaxTotal>
          <TaxTypeCode>IVA</TaxTypeCode>
          <TaxRate>${group.rate}</TaxRate>
          <TaxableAmount>${fmtNumber(group.taxableBase)}</TaxableAmount>
          <TaxAmount>${fmtNumber(group.taxAmount)}</TaxAmount>
        </TaxTotal>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Facturae xmlns="http://www.facturae.es/Facturae/2014/v3.2/Facturae" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FileHeader>
    <SchemaVersion>3.2</SchemaVersion>
    <InvoiceIssuerType>EM</InvoiceIssuerType>
    <InvoiceIssueDate>${issueDate}</InvoiceIssueDate>
    <InvoiceCurrencyCode>${currency}</InvoiceCurrencyCode>
  </FileHeader>
  <Parties>
    <SellerParty>
      <TaxIdentification>
        <PersonTypeCode>J</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${escapeXml(TaxIdentificationNumber)}</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>${companyName}</CorporateName>
        <Address>${companyAddress}</Address>
        <PostCode>${companyPostalCode}</PostCode>
        <Town>${companyCity}</Town>
        <CountryCode>${companyCountry}</CountryCode>
        <Telephone>${companyPhone}</Telephone>
        <Email>${companyEmail}</Email>
      </LegalEntity>
    </SellerParty>
    <BuyerParty>
      <TaxIdentification>
        <PersonTypeCode>N</PersonTypeCode>
        <TaxIdentificationNumber>${escapeXml(buyerTaxId)}</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>${customerName}</CorporateName>
      </LegalEntity>
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>${invoiceNumber}</InvoiceNumber>
        <InvoiceSeriesCode>${escapeXml(empresa?.serie || 'FAC')}</InvoiceSeriesCode>
        <InvoiceDocumentType>FC</InvoiceDocumentType>
        <InvoiceClass>OO</InvoiceClass>
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>${issueDate}</IssueDate>
        ${dueDate ? `<DueDate>${dueDate}</DueDate>` : ''}
      </InvoiceIssueData>
      <InvoiceTotals>
        <TotalInvoiceAmount>${totalAmount}</TotalInvoiceAmount>
        <TotalTaxesOutput>${fmtNumber(factura.iva_total)}</TotalTaxesOutput>
        <TotalOutstandingAmount>${totalAmount}</TotalOutstandingAmount>
      </InvoiceTotals>
      <TaxTotals>
${taxesXml}
      </TaxTotals>
      <InvoiceLines>
${linesXml}
      </InvoiceLines>
    </Invoice>
  </Invoices>
</Facturae>`
}

export function downloadXml(filename, xml) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
