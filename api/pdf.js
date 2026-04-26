import { neon } from '@neondatabase/serverless';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import crypto from 'crypto';

// ── IBAN DECRYPTION ──

function decryptIban(data) {
  if (!data || !process.env.ENCRYPTION_KEY) return null;
  try {
    var parts = data.split(':');
    var key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    var iv = Buffer.from(parts[0], 'hex');
    var tag = Buffer.from(parts[1], 'hex');
    var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(parts[2], 'hex', 'utf8') + decipher.final('utf8');
  } catch (e) { return null; }
}

function formatIban(iban) {
  if (!iban) return null;
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

// ── SVG RECOLOR ──

function recolorSvgLogo(dataUrl, brandColor) {
  if (!dataUrl || !brandColor || !dataUrl.startsWith('data:image/svg')) return dataUrl;
  try {
    var base64Part = dataUrl.split(',')[1];
    var svgText = Buffer.from(base64Part, 'base64').toString('utf8');
    // Replace all fill colors with brand color (except none/transparent)
    svgText = svgText.replace(/fill="(?!none)[^"]*"/gi, 'fill="' + brandColor + '"');
    // Also handle style fill
    svgText = svgText.replace(/fill:\s*#[0-9a-fA-F]{3,8}/gi, 'fill:' + brandColor);
    return 'data:image/svg+xml;base64,' + Buffer.from(svgText).toString('base64');
  } catch (e) { return dataUrl; }
}

// ── HELPERS ──

function fmtEur(v) {
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtJh(v) {
  return Number(v).toFixed(2).replace('.', ',');
}
function fmtDate(d) {
  var months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var dt = new Date(d);
  return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
}
function fmtDateTime(d) {
  var months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var dt = new Date(d);
  var h = dt.getHours().toString().padStart(2,'0');
  var m = dt.getMinutes().toString().padStart(2,'0');
  return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear() + ' à ' + h + ':' + m;
}
function fmtDateShort(d) {
  var dt = new Date(d);
  return dt.getDate().toString().padStart(2,'0') + '/' + (dt.getMonth()+1).toString().padStart(2,'0') + '/' + dt.getFullYear();
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── BUILD HTML TEMPLATE ──

function buildDevisHtml(data) {
  var p = data.project;
  var presta = data.presta_account;
  var prestaAddr = data.presta_address;
  var prestaUser = data.presta_user;
  var client = data.client_account;
  var clientAddr = data.client_address;
  var clientUser = data.client_user;
  var features = data.features;
  var exclusions = data.exclusions;

  var tjm = Number(p.tjm_override || presta.default_tjm || 500);
  var vatRate = Number(presta.default_vat_rate || 20);
  var accent = presta.brand_color || '#0F172A';

  // Recolor SVG logo with brand color
  if (presta.logo_url && presta.logo_url.startsWith('data:image/svg')) {
    presta = Object.assign({}, presta, { logo_url: recolorSvgLogo(presta.logo_url, accent) });
  }
  var refNumber = p.ref_number || 'DEV-' + new Date().getFullYear().toString().slice(2) + '-0001';
  var issuedAt = p.issued_at || p.updated_at || new Date().toISOString();
  var validDays = Number(presta.quote_validity || 30);
  var validUntil = p.valid_until || new Date(new Date(issuedAt).getTime() + validDays * 86400000).toISOString();

  // Calculate totals from included jobs
  var allJobs = [];
  features.forEach(function(f) {
    (f.jobs || []).forEach(function(j) {
      if (!j.is_offered) allJobs.push(j);
    });
  });
  var totalJhIncluded = allJobs.filter(function(j) { return j.included; }).reduce(function(s, j) { return s + Number(j.jh); }, 0);
  var totalJhAll = allJobs.reduce(function(s, j) { return s + Number(j.jh); }, 0);
  var totalHt = totalJhIncluded * tjm;
  var totalTva = totalHt * vatRate / 100;
  var totalTtc = totalHt + totalTva;

  // Offered items
  var offeredFeatures = features.filter(function(f) { return (f.jobs || []).some(function(j) { return j.is_offered; }); });

  // Build price table rows (grouped by feature, only included non-offered jobs)
  var priceRows = '';
  features.forEach(function(f) {
    var regularJobs = (f.jobs || []).filter(function(j) { return !j.is_offered && j.included; });
    if (!regularJobs.length) return;
    var label = f.code ? f.code + ' — ' + esc(f.title) : esc(f.title);
    var featJh = regularJobs.reduce(function(s, j) { return s + Number(j.jh); }, 0);
    priceRows += '<tr class="feat-row"><td colspan="2">' + label + '</td><td class="r">' + fmtJh(featJh) + '</td><td class="r">' + fmtEur(featJh * tjm) + '</td></tr>';
    regularJobs.forEach(function(j) {
      priceRows += '<tr class="job-row"><td class="job-desc" colspan="2">' + esc(j.description) + '</td><td class="r">' + fmtJh(Number(j.jh)) + '</td><td class="r">' + fmtEur(Number(j.jh) * tjm) + '</td></tr>';
    });
  });

  // Offered section
  var offeredRows = '';
  offeredFeatures.forEach(function(f) {
    offeredRows += '<tr class="feat-row"><td colspan="4">' + esc(f.title) + '</td></tr>';
    (f.jobs || []).filter(function(j) { return j.is_offered; }).forEach(function(j) {
      offeredRows += '<tr class="job-row offered"><td class="job-desc" colspan="3">' + esc(j.description) + '</td><td class="r"><span class="pill-offered">Offert</span></td></tr>';
    });
  });

  // CDC Annexe rows (all jobs with badges)
  var cdcRows = '';
  features.forEach(function(f) {
    var regularJobs = (f.jobs || []).filter(function(j) { return !j.is_offered; });
    if (!regularJobs.length) return;
    var label = f.code ? f.code + ' — ' + esc(f.title) : esc(f.title);
    cdcRows += '<tr class="feat-row"><td colspan="4">' + label + '</td></tr>';
    regularJobs.forEach(function(j) {
      var included = j.included
        ? '<span class="incl"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:3pt;"><path d="M20 6L9 17l-5-5" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Inclus</span>'
        : '<span class="excl"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:3pt;"><circle cx="12" cy="12" r="8" stroke="#9CA3AF" stroke-width="2"/></svg>Non retenu</span>';
      var typeBadge = '<span class="pill pill-' + j.type + '">' + (j.type === 'new' ? 'NEW' : 'REFACTO') + '</span>';
      var prioBadge = '<span class="pill pill-' + j.priority + '">' + (j.priority === 'must' ? 'MUST' : 'NICE') + '</span>';
      cdcRows += '<tr class="job-row"><td class="job-desc">' + esc(j.description) + '</td><td class="r">' + typeBadge + ' ' + prioBadge + '</td><td class="r">' + fmtJh(Number(j.jh)) + '</td><td class="r">' + included + '</td></tr>';
    });
  });

  // CDC summary
  var includedCount = allJobs.filter(function(j) { return j.included; }).length;
  var totalCount = allJobs.length;

  // Exclusions
  var exclHtml = exclusions.map(function(e) {
    var lot2 = e.reportable_lot2 ? ' <em style="color:#6B7280;">(envisagé en lot ultérieur, sous réserve d\'un chiffrage séparé)</em>' : '';
    return '<li><strong>' + esc(e.title) + '</strong> — ' + esc(e.description) + lot2 + '</li>';
  }).join('');

  // Planning (dynamic from kickoff_date or issued_at)
  var kickoff = p.kickoff_date ? new Date(p.kickoff_date) : new Date(new Date(issuedAt).getTime() + 7 * 86400000);
  var cap = Number(p.capacity_override || presta.default_weekly_cap || 3);
  var tol = 0.5;
  var eff = cap + tol;
  var devWeeks = Math.ceil(totalJhIncluded / eff) || 1;
  var planningRows = '';
  // S0 — Définition besoin
  var s0start = new Date(issuedAt);
  planningRows += '<tr><td><strong>S0</strong></td><td>' + fmtDateShort(s0start) + '</td><td>Définition du besoin</td></tr>';
  planningRows += '<tr class="highlight"><td></td><td>' + fmtDateShort(kickoff) + '</td><td><strong>Kick-off dev</strong></td></tr>';
  var firstMonday = new Date(kickoff);
  firstMonday.setDate(firstMonday.getDate() - firstMonday.getDay() + 1);
  for (var w = 1; w <= devWeeks + 1; w++) {
    var wMon = new Date(firstMonday);
    wMon.setDate(wMon.getDate() + (w - 1) * 7);
    var wFri = new Date(wMon);
    wFri.setDate(wFri.getDate() + 4);
    var milestone = '';
    if (w === Math.max(1, Math.ceil(devWeeks / 2))) milestone = 'Démo mi-parcours (30 min)';
    if (w === devWeeks) milestone = 'Démo finale + Recette (1h)';
    if (w === devWeeks + 1) { milestone = 'Mise en production'; }
    planningRows += '<tr' + (milestone.includes('Mise en prod') ? ' class="highlight"' : '') + '><td><strong>S' + w + '</strong></td><td>' + fmtDateShort(wMon) + ' — ' + fmtDateShort(wFri) + '</td><td>' + (milestone ? '<strong>' + milestone + '</strong>' : 'Développement') + '</td></tr>';
  }

  // Presta signature block
  var prestaSignatures = data.presta_signatures || [];
  var clientSignatures = data.client_signatures || [];
  var prestaSignHtml = prestaSignatures.length
    ? '<div class="sig-name">' + esc(prestaSignatures[0].signer_name) + '</div><div class="sig-meta">' + fmtDate(prestaSignatures[0].signed_at) + '</div>' + (prestaSignatures[0].signature_image ? '<img class="sig-img" src="' + prestaSignatures[0].signature_image + '">' : '')
    : '<div class="sig-placeholder"></div>';
  var clientSignHtml = clientSignatures.length
    ? '<div class="sig-name">' + esc(clientSignatures[0].signer_name) + '</div><div class="sig-meta">' + fmtDate(clientSignatures[0].signed_at) + '</div>' + (clientSignatures[0].signature_image ? '<img class="sig-img" src="' + clientSignatures[0].signature_image + '">' : '<div style="font-style:italic;font-size:10pt;color:#6B7280;margin-top:6pt;">' + esc(clientSignatures[0].signer_name) + '</div>')
    : '<div class="sig-placeholder"></div>';

  // Certificate data
  var lastSig = clientSignatures.length ? clientSignatures[0] : (prestaSignatures.length ? prestaSignatures[0] : null);

  // Payment conditions
  var payTerms = presta.payment_terms || '30 jours';
  var lateRate = presta.late_payment_rate_label || 'BCE + 10 points';
  var recoveryFee = Number(presta.recovery_fee_amount || 40);
  var escompte = presta.escompte_text || 'Pas d\'escompte pour paiement anticipé';

  // Versioning bandeau
  var prevVersion = data.previous_version;
  var versionBandeau = '';
  if (prevVersion) {
    versionBandeau = '<div style="font-size:8.5pt; color:#6B7280; background:#F9FAFB; padding:6pt 10pt; border-radius:3pt; margin-bottom:12pt;">Version ' + esc(p.version || '1.0') + ' — remplace la version ' + esc(prevVersion.version) + ' du ' + fmtDate(prevVersion.created_at) + '</div>';
  }

  // Preamble
  var preamble = p.preamble || '';

  // Contact projet
  var contactName = presta.project_contact_name || (prestaUser ? prestaUser.name : '');
  var contactEmail = presta.project_contact_email || (prestaUser ? prestaUser.email : '');
  var contactPhone = presta.project_contact_phone || (prestaUser ? (prestaUser.phone_country || '') + (prestaUser.phone || '') : '');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

@page {
  size: A4 portrait;
  margin: 22mm 18mm 22mm 18mm;
}

body {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 9.5pt;
  line-height: 1.45;
  color: #1F2937;
  background: white;
}

/* ── HEADER ── */
.page-header {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 12pt; border-bottom: 1px solid #E5E7EB; margin-bottom: 24pt;
}
@media print { .page-header { display: none; } }
.logo-text { font-size: 14pt; font-weight: 700; color: #0A0A0A; letter-spacing: -0.03em; display: flex; align-items: center; }
.logo-text img { display: block; }
.ref-label { font-size: 8.5pt; color: #6B7280; }

/* ── IDENTITY BLOCKS ── */
.identity { display: flex; gap: 32pt; margin-bottom: 24pt; }
.identity-col { flex: 1; }
.identity-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.05em; color: #6B7280; text-transform: uppercase; margin-bottom: 6pt; }
.identity-name { font-size: 11pt; font-weight: 600; color: #0A0A0A; margin-bottom: 4pt; }
.identity-detail { font-size: 8.5pt; color: #1F2937; line-height: 1.5; }
.identity-detail a { color: ${accent}; text-decoration: none; }

/* ── PROJECT TITLE BLOCK ── */
.doc-type { font-size: 9pt; font-weight: 600; letter-spacing: 0.05em; color: ${accent}; margin-bottom: 6pt; }
.project-title { font-size: 22pt; font-weight: 600; color: #0A0A0A; margin-bottom: 8pt; line-height: 1.2; }
.project-meta { font-size: 9pt; color: #6B7280; margin-bottom: 20pt; }
.project-meta span + span::before { content: ' · '; }

/* ── PREAMBLE ── */
.preamble { font-size: 9.5pt; line-height: 1.55; color: #1F2937; max-width: 140mm; margin-bottom: 20pt; }

/* ── PRICE TABLE ── */
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { font-size: 8.5pt; font-weight: 600; letter-spacing: 0.03em; color: #6B7280; text-align: left; padding: 8pt 6pt; border-bottom: 1px solid #E5E7EB; }
th.r, td.r { text-align: right; }
td { padding: 7pt 6pt; font-size: 9.5pt; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
tr.feat-row td { font-weight: 600; color: #0A0A0A; padding-top: 12pt; border-bottom: none; }
tr.job-row td { color: #1F2937; font-weight: 400; }
tr.job-row.offered td { color: #6B7280; }
td.job-desc { padding-right: 12pt; word-wrap: break-word; overflow-wrap: break-word; }
tr.total-row td { font-weight: 700; font-size: 10pt; border-top: 2px solid #0A0A0A; padding-top: 10pt; }

/* ── TOTAL BLOCK ── */
.total-block {
  background: #F9FAFB; border-radius: 4pt; padding: 16pt 20pt; margin: 20pt 0;
  width: 55%; margin-left: auto;
}
.total-line { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6pt; font-size: 10pt; }
.total-line .label { color: #6B7280; }
.total-line .value { color: #1F2937; font-weight: 500; font-variant-numeric: tabular-nums; }
.total-sep { border-top: 1px solid #E5E7EB; margin: 8pt 0; }
.total-line.ttc .label { font-size: 11pt; font-weight: 600; color: #0A0A0A; }
.total-line.ttc .value { font-size: 22pt; font-weight: 700; color: ${accent}; font-variant-numeric: tabular-nums; }
.rate-note { font-size: 8.5pt; color: #6B7280; font-style: italic; margin-top: 10pt; text-align: right; }

/* ── PILLS / BADGES ── */
.pill { display: inline-block; font-size: 7pt; font-weight: 600; padding: 2pt 6pt; border-radius: 4pt; }
.pill-new { background: #DBEAFE; color: #1E40AF; }
.pill-refacto { background: #FEF3C7; color: #92400E; }
.pill-must { background: #DCFCE7; color: #166534; }
.pill-nice { background: #F4F3EE; color: #6B6560; }
.pill-offered { background: #DCFCE7; color: #166534; font-size: 7.5pt; font-weight: 600; padding: 2pt 8pt; border-radius: 4pt; }
.incl { color: #059669; font-weight: 500; font-size: 8.5pt; }
.excl { color: #6B7280; font-size: 8.5pt; }

/* ── CONDITIONS ── */
.conditions { margin-top: 24pt; }
.conditions h3 { font-size: 11pt; font-weight: 600; color: #0A0A0A; margin-bottom: 10pt; }
.conditions-grid { display: grid; grid-template-columns: 120pt 1fr; gap: 4pt 12pt; font-size: 9pt; }
.conditions-grid .label { color: #6B7280; font-weight: 500; }
.conditions-grid .value { color: #1F2937; }
.iban-value { font-family: 'Courier New', monospace; font-size: 9pt; letter-spacing: 0.03em; }

/* ── SIGNATURE BLOCK ── */
.signature-block { margin-top: 32pt; display: flex; gap: 32pt; page-break-inside: avoid; }
.sig-col { flex: 1; }
.sig-label { font-size: 9pt; font-weight: 600; color: #0A0A0A; margin-bottom: 4pt; }
.sig-mention { font-size: 8pt; color: #6B7280; margin-bottom: 12pt; font-style: italic; }
.sig-name { font-size: 9.5pt; font-weight: 500; color: #0A0A0A; }
.sig-meta { font-size: 8pt; color: #6B7280; }
.sig-placeholder { height: 48pt; border-bottom: 1px solid #E5E7EB; }
.sig-img { max-width: 120pt; max-height: 48pt; margin-top: 4pt; }

/* ── ANNEXES ── */
.annexe-break { page-break-before: always; }
.annexe-label { font-size: 8.5pt; font-weight: 600; letter-spacing: 0.05em; color: ${accent}; text-transform: uppercase; margin-bottom: 4pt; margin-top: 24pt; }
.annexe-title { font-size: 16pt; font-weight: 600; color: #0A0A0A; margin-bottom: 16pt; }
.cdc-summary { font-size: 9pt; color: #6B7280; margin-bottom: 16pt; padding: 10pt 14pt; background: #F9FAFB; border-radius: 4pt; }

/* ── HORS SCOPE ── */
.exclusions-list { list-style: none; padding: 0; }
.exclusions-list li { padding: 8pt 0; border-bottom: 1px solid #F3F4F6; font-size: 9.5pt; line-height: 1.5; }
.exclusions-list li strong { color: #0A0A0A; }

/* ── PLANNING ── */
.planning-table th { font-size: 8pt; }
.planning-table td { font-size: 9pt; padding: 6pt; }
tr.highlight td { background: #F0FDF4; color: #166534; font-weight: 600; }
.planning-note { font-size: 8pt; color: #6B7280; margin-top: 8pt; }

/* ── CERTIFICATE ── */
.cert-title { font-size: 16pt; font-weight: 600; color: #0A0A0A; margin-bottom: 20pt; }
.cert-table { width: 100%; }
.cert-table td { padding: 6pt 8pt; font-size: 9pt; vertical-align: top; border-bottom: 1px solid #F3F4F6; }
.cert-table td:first-child { color: #6B7280; font-weight: 500; width: 35%; }
.cert-table td:last-child { color: #1F2937; }
.cert-hash { font-family: 'Courier New', monospace; font-size: 7.5pt; word-break: break-all; color: #1F2937; }
.cert-legal { font-size: 8pt; color: #6B7280; font-style: italic; line-height: 1.5; margin-top: 20pt; }

/* ── ANTI-COUPURE ── */
.total-block, .conditions, .signature-block, .identity, .pay-block { page-break-inside: avoid; }
.feat-group { page-break-inside: avoid; }
.annexe-title { page-break-after: avoid; }
tr.feat-row { page-break-after: avoid; }

/* ── CGV ── */
.cgv-content { font-size: 9pt; line-height: 1.55; color: #1F2937; white-space: pre-line; }

/* ── IBAN REMINDER ── */
.iban-reminder { margin-top: 24pt; padding: 12pt 16pt; background: #F9FAFB; border-radius: 4pt; font-size: 9pt; color: #1F2937; page-break-inside: avoid; }
.iban-reminder div { margin-bottom: 2pt; }
.iban-reminder .iban-value { font-family: 'Courier New', monospace; letter-spacing: 0.03em; }

/* ── FOOTER ── */
.page-footer {
  position: fixed; bottom: 0; left: 0; right: 0;
  font-size: 8pt; color: #6B7280;
  border-top: 1px solid #E5E7EB; padding-top: 6pt;
  display: flex; justify-content: space-between;
}
</style>
</head>
<body>

<!-- ═══════ PAGE 1 — DEVIS ═══════ -->
<div class="page-header">
  <div class="logo-text">${presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)}</div>
  <div class="ref-label">${esc(refNumber)}</div>
</div>

<div class="identity">
  <div class="identity-col">
    <div class="identity-label">PRESTATAIRE</div>
    <div class="identity-name">${esc(presta.legal_name || presta.name)}</div>
    <div class="identity-detail">
      ${presta.legal_form ? esc(presta.legal_form) + (presta.capital ? ' au capital de ' + esc(presta.capital) + ' €' : '') + '<br>' : ''}
      ${presta.siren ? 'SIREN ' + esc(presta.siren) : ''}${presta.ape_code ? ' — APE ' + esc(presta.ape_code) : ''}<br>
      ${presta.tva_intra ? 'TVA ' + esc(presta.tva_intra) + '<br>' : ''}
      ${presta.rcs_city ? esc(presta.rcs_city) + '<br>' : ''}
      ${prestaAddr ? esc(prestaAddr.line1) + (prestaAddr.line2 ? ', ' + esc(prestaAddr.line2) : '') + '<br>' + esc(prestaAddr.zip) + ' ' + esc(prestaAddr.city) + '<br>' : ''}
      ${contactName ? esc(contactName) + (presta.project_contact_role ? ' — ' + esc(presta.project_contact_role) : '') + '<br>' : ''}
      ${contactEmail ? '<a href="mailto:' + esc(contactEmail) + '">' + esc(contactEmail) + '</a>' : ''}${contactPhone ? ' — ' + esc(contactPhone) : ''}
    </div>
  </div>
  <div class="identity-col">
    <div class="identity-label">CLIENT</div>
    <div class="identity-name">${esc(client ? (client.legal_name || client.name) : '')}</div>
    <div class="identity-detail">
      ${client && client.legal_form ? esc(client.legal_form) : ''}${client && client.capital ? ' au capital de ' + esc(client.capital) + ' €' : ''}<br>
      ${client && client.siren ? 'SIREN ' + esc(client.siren) + '<br>' : ''}
      ${client && client.tva_intra ? 'TVA ' + esc(client.tva_intra) + '<br>' : ''}
      ${clientAddr ? esc(clientAddr.line1) + (clientAddr.line2 ? ', ' + esc(clientAddr.line2) : '') + '<br>' + esc(clientAddr.zip) + ' ' + esc(clientAddr.city) + '<br>' : ''}
      ${clientUser ? esc(clientUser.name) + '<br>' : ''}
      ${clientUser ? '<a href="mailto:' + esc(clientUser.email) + '">' + esc(clientUser.email) + '</a>' : ''}
    </div>
  </div>
</div>

<div class="doc-type">DEVIS N° ${esc(refNumber)}</div>
<div class="project-title">${esc(p.title)}</div>
<div class="project-meta">
  <span>Version ${esc(p.version || '1.0')}</span>
  <span>Émis le ${fmtDate(issuedAt)}</span>
  <span>Valable jusqu'au ${fmtDate(validUntil)}</span>
</div>

${versionBandeau}
${preamble ? '<div class="preamble">' + esc(preamble) + '</div>' : ''}

<!-- Price table -->
<table>
  <thead>
    <tr><th style="width:55%">Description</th><th style="width:15%"></th><th class="r" style="width:12%">J/H</th><th class="r" style="width:18%">Montant HT</th></tr>
  </thead>
  <tbody>
    ${priceRows}
  </tbody>
</table>

${offeredRows ? '<div style="margin-top:16pt;"><table><thead><tr><th colspan="4" style="color:#059669; border-bottom-color:#DCFCE7;">Prestations offertes</th></tr></thead><tbody>' + offeredRows + '</tbody></table></div>' : ''}

<!-- Total block -->
<div class="total-block">
  <div class="total-line"><span class="label">Total HT</span><span class="value">${fmtEur(totalHt)}</span></div>
  <div class="total-line"><span class="label">TVA ${vatRate.toFixed(0)} %</span><span class="value">${fmtEur(totalTva)}</span></div>
  <div class="total-sep"></div>
  <div class="total-line ttc"><span class="label">Total TTC</span><span class="value">${fmtEur(totalTtc)}</span></div>
</div>
<div class="rate-note">Taux journalier appliqué : ${fmtEur(tjm)} HT — ${fmtJh(totalJhIncluded)} J/H × ${fmtEur(tjm)} = ${fmtEur(totalHt)} HT</div>

<!-- Conditions de paiement -->
<div class="conditions">
  <h3>Conditions de paiement</h3>
  <div class="conditions-grid">
    <div class="label">Délai de règlement</div><div class="value">${esc(payTerms)}</div>
    <div class="label">Pénalités de retard</div><div class="value">${esc(lateRate)}</div>
    <div class="label">Indemnité recouvrement</div><div class="value">${fmtEur(recoveryFee)}</div>
    <div class="label">Escompte</div><div class="value">${esc(escompte)}</div>
    <div class="label">Mode de règlement</div><div class="value">Virement bancaire</div>
    ${data.presta_iban ? '<div class="label">IBAN</div><div class="value iban-value">' + esc(data.presta_iban) + '</div>' : ''}
    ${data.presta_bic ? '<div class="label">BIC</div><div class="value">' + esc(data.presta_bic) + '</div>' : ''}
    ${presta.cgv_url ? '<div class="label">CGV</div><div class="value">Consultables sur <a href="' + esc(presta.cgv_url) + '">' + esc(presta.cgv_url) + '</a></div>' : ''}
  </div>
</div>

${data.presta_iban ? '<div class="iban-reminder"><div>Mode de règlement : Virement bancaire</div><div>IBAN : <span class="iban-value">' + esc(data.presta_iban) + '</span>' + (data.presta_bic ? ' · BIC : ' + esc(data.presta_bic) : '') + '</div></div>' : ''}

<!-- Signature block -->
<div class="signature-block">
  <div class="sig-col">
    <div class="sig-label">Pour le prestataire</div>
    <div class="sig-mention">Bon pour accord, valable engagement contractuel</div>
    ${prestaSignHtml}
  </div>
  <div class="sig-col">
    <div class="sig-label">Pour le client</div>
    <div class="sig-mention">Bon pour accord, valable engagement contractuel</div>
    ${clientSignHtml}
  </div>
</div>

<!-- ═══════ ANNEXE A — CDC ═══════ -->
<div class="annexe-break"></div>
<div class="page-header">
  <div class="logo-text">${presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)}</div>
  <div class="ref-label">${esc(refNumber)}</div>
</div>
<div class="annexe-label">ANNEXE A</div>
<div class="annexe-title">Cahier des charges</div>
<div class="cdc-summary">${includedCount} jobs retenus sur ${totalCount} proposés — ${fmtJh(totalJhIncluded)} J/H facturés sur ${fmtJh(totalJhAll)} J/H estimés</div>

<table>
  <thead>
    <tr><th style="width:50%">Description</th><th class="r" style="width:18%">Type / Priorité</th><th class="r" style="width:12%">J/H</th><th class="r" style="width:20%">Statut</th></tr>
  </thead>
  <tbody>
    ${cdcRows}
  </tbody>
</table>

<!-- ═══════ ANNEXE B — PLANNING ═══════ -->
<div class="annexe-break"></div>
<div class="page-header">
  <div class="logo-text">${presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)}</div>
  <div class="ref-label">${esc(refNumber)}</div>
</div>
<div class="annexe-label">ANNEXE B</div>
<div class="annexe-title">Planning de livraison</div>

<table class="planning-table">
  <thead><tr><th style="width:12%">Semaine</th><th style="width:35%">Période</th><th style="width:53%">Livrables</th></tr></thead>
  <tbody>${planningRows}</tbody>
</table>
<div class="planning-note">Capacité : ${fmtJh(cap)} J/H / semaine. Les dates de démo et recette sont indicatives.</div>

<!-- ═══════ ANNEXE C — HORS SCOPE ═══════ -->
<div class="annexe-break"></div>
<div class="page-header">
  <div class="logo-text">${presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)}</div>
  <div class="ref-label">${esc(refNumber)}</div>
</div>
<div class="annexe-label">ANNEXE C</div>
<div class="annexe-title">Hors scope et dépendances</div>
<ul class="exclusions-list">${exclHtml}</ul>

${presta.cgv_text ? '<div class="annexe-break"></div><div class="page-header"><div class="logo-text">' + (presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)) + '</div><div class="ref-label">' + esc(refNumber) + '</div></div><div class="annexe-label">ANNEXE D</div><div class="annexe-title">Conditions Générales de Vente</div><div class="cgv-content">' + esc(presta.cgv_text) + '</div>' : ''}

<!-- ═══════ CERTIFICAT DE SIGNATURE ═══════ -->
${lastSig ? `
<div class="annexe-break"></div>
<div class="page-header">
  <div class="logo-text">${presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)}</div>
  <div class="ref-label">${esc(refNumber)}</div>
</div>
<div class="cert-title">Certificat de signature électronique</div>
<table class="cert-table">
  <tr><td>Référence du document</td><td>${esc(refNumber)} — ${esc(p.title)}</td></tr>
  ${prestaSignatures.length ? '<tr><td>Signature prestataire</td><td>' + esc(prestaSignatures[0].signer_name) + ' &lt;' + esc(prestaSignatures[0].signer_email) + '&gt;<br>' + fmtDateTime(prestaSignatures[0].signed_at) + (prestaSignatures[0].ip_address ? ' — IP ' + esc(prestaSignatures[0].ip_address) : '') + (prestaSignatures[0].city ? ' (' + esc(prestaSignatures[0].city) + ')' : '') + '</td></tr>' : ''}
  ${clientSignatures.length ? '<tr><td>Signature client</td><td>' + esc(clientSignatures[0].signer_name) + ' &lt;' + esc(clientSignatures[0].signer_email) + '&gt;<br>' + fmtDateTime(clientSignatures[0].signed_at) + (clientSignatures[0].ip_address ? ' — IP ' + esc(clientSignatures[0].ip_address) : '') + (clientSignatures[0].city ? ' (' + esc(clientSignatures[0].city) + ')' : '') + '</td></tr>' : ''}
  <tr><td>Empreinte SHA-256</td><td><span class="cert-hash">${lastSig.devis_hash || '—'}</span></td></tr>
  <tr><td>Portée du hash</td><td>Empreinte calculée sur l'intégralité du présent document (pages 1 à N hors zone de signature électronique elle-même).</td></tr>
  <tr><td>Base légale</td><td>Signature électronique simple au sens de l'article 1367 du Code civil.</td></tr>
</table>
<div class="cert-legal">
  L'adresse IP du signataire est collectée à des fins probatoires (article 1367 du Code civil) et conservée 10 ans.
  Données traitées par ${esc(presta.legal_name || presta.name)} en qualité de sous-traitant.
  Droits d'accès, rectification, suppression sur demande à ${esc(contactEmail)}.
</div>
` : ''}

</body>
</html>`;
}

// ── API HANDLER ──

// ── INVOICE HTML TEMPLATE ──

function buildInvoiceHtml(data) {
  var inv = data.invoice;
  var p = data.project;
  var presta = data.presta_account;
  var prestaAddr = data.presta_address;
  var prestaUser = data.presta_user;
  var client = data.client_account;
  var clientAddr = data.client_address;
  var clientUser = data.client_user;
  var accent = presta.brand_color || '#0F172A';
  var vatRate = Number(presta.default_vat_rate || 20);

  // Recolor SVG logo with brand color
  if (presta.logo_url && presta.logo_url.startsWith('data:image/svg')) {
    presta = Object.assign({}, presta, { logo_url: recolorSvgLogo(presta.logo_url, accent) });
  }

  var contactName = presta.project_contact_name || (prestaUser ? prestaUser.name : '');
  var contactEmail = presta.project_contact_email || (prestaUser ? prestaUser.email : '');
  var contactPhone = presta.project_contact_phone || (prestaUser ? (prestaUser.phone_country || '') + (prestaUser.phone || '') : '');

  var payTerms = presta.payment_terms || '30 jours';
  var lateRate = presta.late_payment_rate_label || 'BCE + 10 points';
  var recoveryFee = Number(presta.recovery_fee_amount || 40);
  var escompte = presta.escompte_text || 'Pas d\'escompte pour paiement anticipé';

  var dueDate = inv.due_at ? fmtDate(inv.due_at) : '';
  var issuedDate = inv.issued_at ? fmtDate(inv.issued_at) : fmtDate(new Date().toISOString());

  // Build line items from devis features/jobs
  var features = data.features || [];
  var tjm = Number(inv.data_json.tjm || 500);
  var lineRows = '';
  features.forEach(function(f) {
    var jobs = (f.jobs || []).filter(function(j) { return !j.is_offered && j.included; });
    if (!jobs.length) return;
    var label = f.code ? f.code + ' — ' + esc(f.title) : esc(f.title);
    var featJh = jobs.reduce(function(s, j) { return s + Number(j.jh); }, 0);
    lineRows += '<tr class="feat-row"><td colspan="2">' + label + '</td><td class="r">' + fmtJh(featJh) + '</td><td class="r">' + fmtEur(featJh * tjm) + '</td></tr>';
    jobs.forEach(function(j) {
      lineRows += '<tr class="job-row"><td class="job-desc" colspan="2">' + esc(j.description) + '</td><td class="r">' + fmtJh(Number(j.jh)) + '</td><td class="r">' + fmtEur(Number(j.jh) * tjm) + '</td></tr>';
    });
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4 portrait; margin: 22mm 18mm; }
body { font-family: 'Inter', sans-serif; font-size: 9.5pt; line-height: 1.45; color: #1F2937; background: white; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12pt; border-bottom: 1px solid #E5E7EB; margin-bottom: 24pt; }
@media print { .page-header { display: none; } }
.logo-text { font-size: 14pt; font-weight: 700; color: #0A0A0A; }
.ref-label { font-size: 8.5pt; color: #6B7280; }
.identity { display: flex; gap: 32pt; margin-bottom: 24pt; }
.identity-col { flex: 1; }
.identity-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.05em; color: #6B7280; text-transform: uppercase; margin-bottom: 6pt; }
.identity-name { font-size: 11pt; font-weight: 600; color: #0A0A0A; margin-bottom: 4pt; }
.identity-detail { font-size: 8.5pt; color: #1F2937; line-height: 1.5; }
.identity-detail a { color: ${accent}; text-decoration: none; }
.doc-type { font-size: 9pt; font-weight: 600; letter-spacing: 0.05em; color: ${accent}; margin-bottom: 6pt; }
.project-title { font-size: 22pt; font-weight: 600; color: #0A0A0A; margin-bottom: 8pt; line-height: 1.2; }
.project-meta { font-size: 9pt; color: #6B7280; margin-bottom: 20pt; }
.project-meta span + span::before { content: ' · '; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { font-size: 8.5pt; font-weight: 600; letter-spacing: 0.03em; color: #6B7280; text-align: left; padding: 8pt 6pt; border-bottom: 1px solid #E5E7EB; }
th.r, td.r { text-align: right; }
td { padding: 7pt 6pt; font-size: 9.5pt; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
tr.feat-row td { font-weight: 600; color: #0A0A0A; padding-top: 12pt; border-bottom: none; }
tr.job-row td { color: #1F2937; }
td.job-desc { padding-right: 12pt; word-wrap: break-word; }
.total-block { background: #F9FAFB; border-radius: 4pt; padding: 16pt 20pt; margin: 20pt 0; width: 55%; margin-left: auto; }
.total-line { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6pt; font-size: 10pt; }
.total-line .label { color: #6B7280; }
.total-line .value { color: #1F2937; font-weight: 500; font-variant-numeric: tabular-nums; }
.total-sep { border-top: 1px solid #E5E7EB; margin: 8pt 0; }
.total-line.ttc .label { font-size: 11pt; font-weight: 600; color: #0A0A0A; }
.total-line.ttc .value { font-size: 22pt; font-weight: 700; color: ${accent}; font-variant-numeric: tabular-nums; }
.pay-block { background: ${accent}; color: white; border-radius: 6pt; padding: 20pt 24pt; margin: 24pt 0; }
.pay-block h3 { font-size: 12pt; font-weight: 700; margin-bottom: 12pt; }
.pay-block .amount { font-size: 28pt; font-weight: 700; margin-bottom: 8pt; font-variant-numeric: tabular-nums; }
.pay-block .due { font-size: 10pt; opacity: 0.85; margin-bottom: 16pt; }
.pay-grid { display: grid; grid-template-columns: 80pt 1fr; gap: 4pt 12pt; font-size: 9pt; }
.pay-grid .label { opacity: 0.7; font-weight: 500; }
.pay-grid .value { font-weight: 500; }
.pay-grid .iban { font-family: 'Courier New', monospace; font-size: 9pt; letter-spacing: 0.03em; }
.conditions { margin-top: 24pt; }
.conditions h3 { font-size: 11pt; font-weight: 600; color: #0A0A0A; margin-bottom: 10pt; }
.conditions-grid { display: grid; grid-template-columns: 120pt 1fr; gap: 4pt 12pt; font-size: 9pt; }
.conditions-grid .label { color: #6B7280; font-weight: 500; }
.conditions-grid .value { color: #1F2937; }
.legal-mentions { font-size: 8pt; color: #6B7280; line-height: 1.5; margin-top: 24pt; border-top: 1px solid #E5E7EB; padding-top: 12pt; }
.total-block, .conditions, .signature-block, .identity, .pay-block { page-break-inside: avoid; }
.feat-group { page-break-inside: avoid; }
tr.feat-row { page-break-after: avoid; }
</style>
</head>
<body>

<div class="page-header">
  <div class="logo-text">${presta.logo_url ? '<img src="' + presta.logo_url + '" style="max-width:50mm;height:14mm;width:auto;object-fit:contain;">' : esc(presta.legal_name || presta.name)}</div>
  <div class="ref-label">${esc(inv.invoice_number)}</div>
</div>

<div class="identity">
  <div class="identity-col">
    <div class="identity-label">ÉMETTEUR</div>
    <div class="identity-name">${esc(presta.legal_name || presta.name)}</div>
    <div class="identity-detail">
      ${presta.legal_form ? esc(presta.legal_form) + (presta.capital ? ' au capital de ' + esc(presta.capital) + ' €' : '') + '<br>' : ''}
      ${presta.siren ? 'SIREN ' + esc(presta.siren) : ''}${presta.ape_code ? ' — APE ' + esc(presta.ape_code) : ''}<br>
      ${presta.tva_intra ? 'TVA ' + esc(presta.tva_intra) + '<br>' : ''}
      ${presta.rcs_city ? esc(presta.rcs_city) + '<br>' : ''}
      ${prestaAddr ? esc(prestaAddr.line1) + '<br>' + esc(prestaAddr.zip) + ' ' + esc(prestaAddr.city) + '<br>' : ''}
      ${contactEmail ? '<a href="mailto:' + esc(contactEmail) + '">' + esc(contactEmail) + '</a>' : ''}
    </div>
  </div>
  <div class="identity-col">
    <div class="identity-label">CLIENT</div>
    <div class="identity-name">${esc(client ? (client.legal_name || client.name) : '')}</div>
    <div class="identity-detail">
      ${client && client.siren ? 'SIREN ' + esc(client.siren) + '<br>' : ''}
      ${client && client.tva_intra ? 'TVA ' + esc(client.tva_intra) + '<br>' : ''}
      ${clientAddr ? esc(clientAddr.line1) + '<br>' + esc(clientAddr.zip) + ' ' + esc(clientAddr.city) + '<br>' : ''}
      ${clientUser ? esc(clientUser.name) + '<br><a href="mailto:' + esc(clientUser.email) + '">' + esc(clientUser.email) + '</a>' : ''}
    </div>
  </div>
</div>

<div class="doc-type">FACTURE${inv.invoice_number ? ' N° ' + esc(inv.invoice_number) : ' (brouillon)'}</div>
<div class="project-title">${esc(p.title)}</div>
<div class="project-meta">
  <span>Émise le ${issuedDate}</span>
  <span>Échéance : ${dueDate}</span>
  ${p.ref_number ? '<span>Réf. devis : ' + esc(p.ref_number) + (data.devis_signed_at ? ' · signé le ' + fmtDateShort(data.devis_signed_at) : '') + '</span>' : ''}
  ${inv.invoice_type === 'acompte' ? '<span>Facture d\'acompte</span>' : inv.invoice_type === 'solde' ? '<span>Facture de solde</span>' : inv.milestone_label ? '<span>Jalon : ' + esc(inv.milestone_label) + '</span>' : ''}
</div>
${inv.delivery_period_start && inv.delivery_period_end ? '<div class="project-meta" style="margin-top:-12pt;"><span>Prestation délivrée du ' + fmtDateShort(inv.delivery_period_start) + ' au ' + fmtDateShort(inv.delivery_period_end) + '</span></div>' : ''}

<table>
  <thead><tr><th style="width:55%">Description</th><th style="width:15%"></th><th class="r" style="width:12%">J/H</th><th class="r" style="width:18%">Montant HT</th></tr></thead>
  <tbody>${lineRows}</tbody>
</table>

<div class="total-block">
  <div class="total-line"><span class="label">Total HT</span><span class="value">${fmtEur(Number(inv.amount_ht))}</span></div>
  <div class="total-line"><span class="label">TVA ${vatRate.toFixed(0)} %</span><span class="value">${fmtEur(Number(inv.amount_tva))}</span></div>
  <div class="total-sep"></div>
  <div class="total-line ttc"><span class="label">Total TTC</span><span class="value">${fmtEur(Number(inv.amount_ttc))}</span></div>
</div>

<div class="pay-block">
  <h3>À payer</h3>
  <div class="amount">${fmtEur(Number(inv.amount_ttc))}</div>
  <div class="due">Date d'échéance : ${dueDate}</div>
  <div class="pay-grid">
    <div class="label">Référence</div><div class="value">${esc(inv.invoice_number)}</div>
    ${data.presta_iban ? '<div class="label">IBAN</div><div class="value iban">' + esc(data.presta_iban) + '</div>' : ''}
    ${data.presta_bic ? '<div class="label">BIC</div><div class="value">' + esc(data.presta_bic) + '</div>' : ''}
  </div>
</div>

<div class="conditions">
  <h3>Conditions</h3>
  <div class="conditions-grid">
    <div class="label">Délai de règlement</div><div class="value">${esc(payTerms)}</div>
    <div class="label">Pénalités de retard</div><div class="value">${esc(lateRate)}</div>
    <div class="label">Indemnité recouvrement</div><div class="value">${fmtEur(recoveryFee)}</div>
    <div class="label">Escompte</div><div class="value">${esc(escompte)}</div>
  </div>
</div>

<div class="legal-mentions">
  ${presta.legal_name ? esc(presta.legal_name) : ''} ${presta.legal_form ? '— ' + esc(presta.legal_form) : ''} ${presta.capital ? 'au capital de ' + esc(presta.capital) + ' €' : ''}<br>
  ${presta.siren ? 'SIREN ' + esc(presta.siren) : ''} ${presta.rcs_city ? '— ' + esc(presta.rcs_city) : ''} ${presta.tva_intra ? '— TVA ' + esc(presta.tva_intra) : ''}
</div>

</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var sql = neon(process.env.DATABASE_URL);
  var slug = req.query.slug;
  var pdfType = req.query.type || 'devis'; // 'devis' or 'invoice'
  var invoiceId = req.query.invoice_id;

  if (!slug && !invoiceId) return res.status(400).json({ error: 'slug or invoice_id required' });

  try {
    // ── SERVE FROZEN SIGNED PDF ──
    if (req.query.version === 'signed') {
      if (pdfType === 'invoice' && invoiceId) {
        var frozenInv = await sql`SELECT pdf_blob FROM invoices WHERE id = ${invoiceId} AND pdf_blob IS NOT NULL`;
        if (frozenInv.length && frozenInv[0].pdf_blob) {
          var frozenBuf = Buffer.from(frozenInv[0].pdf_blob);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', frozenBuf.length);
          res.setHeader('Content-Disposition', 'inline; filename="facture-signed.pdf"');
          res.statusCode = 200;
          return res.end(frozenBuf);
        }
      } else if (slug) {
        var frozenSig = await sql`SELECT ds.pdf_blob FROM devis_signatures ds JOIN projects p ON p.id = ds.project_id WHERE p.slug = ${slug} AND ds.signer_role = 'client' AND ds.status = 'active' AND ds.pdf_blob IS NOT NULL ORDER BY ds.signed_at DESC LIMIT 1`;
        if (frozenSig.length && frozenSig[0].pdf_blob) {
          var frozenBuf = Buffer.from(frozenSig[0].pdf_blob);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', frozenBuf.length);
          res.setHeader('Content-Disposition', 'inline; filename="devis-signed.pdf"');
          res.statusCode = 200;
          return res.end(frozenBuf);
        }
      }
      // Fall through to regeneration if no frozen blob
    }

    // ── INVOICE PDF ──
    if (pdfType === 'invoice' && invoiceId) {
      var invRows = await sql`SELECT * FROM invoices WHERE id = ${invoiceId}`;
      if (!invRows.length) return res.status(404).json({ error: 'invoice not found' });
      var invoice = invRows[0];

      var invProject = (await sql`SELECT * FROM projects WHERE id = ${invoice.project_id}`)[0];
      var invPresta = invProject.freelance_account_id ? (await sql`SELECT * FROM accounts WHERE id = ${invProject.freelance_account_id}`)[0] : {};
      var invPrestaUser = invProject.freelance_account_id ? (await sql`SELECT * FROM users WHERE account_id = ${invProject.freelance_account_id} LIMIT 1`)[0] : null;
      var invPrestaAddr = invProject.freelance_account_id ? (await sql`SELECT * FROM addresses WHERE account_id = ${invProject.freelance_account_id} LIMIT 1`)[0] : null;
      var invClient = invProject.client_account_id ? (await sql`SELECT * FROM accounts WHERE id = ${invProject.client_account_id}`)[0] : null;
      var invClientUser = invProject.client_account_id ? (await sql`SELECT * FROM users WHERE account_id = ${invProject.client_account_id} LIMIT 1`)[0] : null;
      var invClientAddr = invProject.client_account_id ? (await sql`SELECT * FROM addresses WHERE account_id = ${invProject.client_account_id} LIMIT 1`)[0] : null;

      var invFeatures = await sql`SELECT * FROM features WHERE project_id = ${invProject.id} ORDER BY position`;
      for (var fi = 0; fi < invFeatures.length; fi++) {
        invFeatures[fi].jobs = await sql`SELECT * FROM jobs WHERE feature_id = ${invFeatures[fi].id} ORDER BY position`;
      }

      var invPayMethods = invProject.freelance_account_id ? await sql`SELECT * FROM payment_methods WHERE account_id = ${invProject.freelance_account_id} LIMIT 1` : [];
      var invIban = invPayMethods.length ? formatIban(decryptIban(invPayMethods[0].iban_encrypted)) : null;
      var invBic = invPayMethods.length ? invPayMethods[0].bic : null;

      // Fetch devis signature date for reference
      var invDevisSig = invoice.devis_signature_id ? await sql`SELECT signed_at FROM devis_signatures WHERE id = ${invoice.devis_signature_id}` : [];
      var invDevisSignedAt = invDevisSig.length ? invDevisSig[0].signed_at : null;

      var invHtml = buildInvoiceHtml({
        invoice: invoice, project: invProject,
        presta_account: invPresta, presta_user: invPrestaUser, presta_address: invPrestaAddr,
        client_account: invClient, client_user: invClientUser, client_address: invClientAddr,
        features: invFeatures, presta_iban: invIban, presta_bic: invBic,
        devis_signed_at: invDevisSignedAt
      });

      if (req.query.format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(invHtml);
      }

      var invBrowser = await puppeteer.launch({ args: chromium.args, defaultViewport: chromium.defaultViewport, executablePath: await chromium.executablePath(), headless: chromium.headless });
      var invPage = await invBrowser.newPage();
      await invPage.setContent(invHtml, { waitUntil: 'networkidle0' });
      var invRecoloredLogo = (invPresta || {}).logo_url ? recolorSvgLogo(invPresta.logo_url, (invPresta || {}).brand_color || '#0F172A') : null;
      var invLogoHtml = invRecoloredLogo
        ? '<img src="' + invRecoloredLogo + '" style="max-width:50mm;height:10mm;width:auto;object-fit:contain;">'
        : '<span style="font-size:10pt;font-weight:700;color:#0A0A0A;">' + esc((invPresta || {}).legal_name || (invPresta || {}).name || '') + '</span>';
      var invHeader = '<div style="width:100%;font-family:Inter,sans-serif;display:flex;justify-content:space-between;align-items:center;padding:4mm 18mm 2mm 18mm;border-bottom:0.5px solid #E5E7EB;">'
        + '<span>' + invLogoHtml + '</span>'
        + '<span style="font-size:7pt;color:#9CA3AF;">' + esc(invoice.invoice_number || '') + '</span>'
        + '</div>';
      var invFooter = '<div style="width:100%;font-family:Inter,sans-serif;font-size:7pt;color:#9CA3AF;display:flex;justify-content:space-between;padding:0 18mm;">'
        + '<span>' + esc(invoice.invoice_number || '') + ' — ' + esc((invProject.title || '').substring(0, 60)) + '</span>'
        + '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
        + '<span>' + esc((invPresta || {}).legal_name || (invPresta || {}).name || '') + '</span>'
        + '</div>';
      var invPdfBuf = await invPage.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: invHeader, footerTemplate: invFooter, margin: { top: '32mm', right: '18mm', bottom: '28mm', left: '18mm' } });
      await invBrowser.close();

      var invBuf = Buffer.from(invPdfBuf);

      // If ?notify=1, email the invoice to client
      if (req.query.notify === '1') {
        // Store frozen PDF blob for invoice
        await sql`UPDATE invoices SET pdf_blob = ${invBuf} WHERE id = ${invoice.id}`;

        var invPdfBase64 = invBuf.toString('base64');
        var invClientEmail = invClientUser ? invClientUser.email : null;
        var invPrestaEmail = invPrestaUser ? invPrestaUser.email : null;

        var invEmailHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
          + '<body style="margin:0;padding:0;background:#f4f3ee;font-family:-apple-system,sans-serif;">'
          + '<table width="100%" style="background:#f4f3ee;padding:32px 16px;"><tr><td align="center">'
          + '<table width="520" style="max-width:520px;">'
          + '<tr><td style="padding:0 0 24px;"><table width="100%"><tr>'
          + '<td style="font-size:18px;font-weight:700;color:#2d2b35;">iron seal</td>'
          + '<td align="right" style="font-size:11px;color:#b1ada1;">Facturation</td>'
          + '</tr></table></td></tr>'
          + '<tr><td style="background:white;border-radius:10px;padding:32px 36px;">'
          + '<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;background:#DBEAFE;color:#1E40AF;">Nouvelle facture</span></p>'
          + '<h2 style="font-size:20px;font-weight:700;color:#2d2b35;margin:0 0 16px;">' + esc(invoice.invoice_number) + '</h2>'
          + '<p style="font-size:14px;color:#4a4850;line-height:1.7;margin:0 0 8px;">Montant : <strong>' + fmtEur(Number(invoice.amount_ttc)) + ' TTC</strong></p>'
          + '<p style="font-size:13px;color:#6b6560;">La facture est jointe à cet email en PDF.</p>'
          + '</td></tr></table></td></tr></table></body></html>';

        var invAttachments = [{ filename: invoice.invoice_number + '.pdf', content: invPdfBase64 }];

        if (invClientEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.RESEND_KEY },
            body: JSON.stringify({ from: 'Iron Seal <notifications@mail.blueheronlab.com>', to: invClientEmail, subject: 'Facture ' + invoice.invoice_number + ' — ' + invProject.title, html: invEmailHtml, attachments: invAttachments })
          });
        }
        if (invPrestaEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.RESEND_KEY },
            body: JSON.stringify({ from: 'Iron Seal <notifications@mail.blueheronlab.com>', to: invPrestaEmail, subject: 'Facture envoyée : ' + invoice.invoice_number, html: invEmailHtml, attachments: invAttachments })
          });
        }
        // Mark invoice as sent and assign number if missing
        if (!invoice.invoice_number) {
          var seqRes = await sql`SELECT nextval('invoice_number_seq') as num`;
          var seqNum = parseInt(seqRes[0].num);
          var yr = new Date().getFullYear().toString().slice(2);
          var newInvNum = 'FAC-' + yr + '-' + seqNum.toString().padStart(4, '0');
          await sql`UPDATE invoices SET invoice_number = ${newInvNum}, status = 'sent', updated_at = NOW() WHERE id = ${invoice.id} AND status = 'draft'`;
        } else {
          await sql`UPDATE invoices SET status = 'sent', updated_at = NOW() WHERE id = ${invoice.id} AND status = 'draft'`;
        }
        return res.json({ ok: true, emailed: true });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', invBuf.length);
      res.setHeader('Content-Disposition', 'inline; filename="' + invoice.invoice_number + '.pdf"');
      res.statusCode = 200;
      return res.end(invBuf);
    }

    // ── DEVIS PDF ──
    if (!slug) return res.status(400).json({ error: 'slug required for devis PDF' });

    // Load project
    var projects = await sql`SELECT * FROM projects WHERE slug = ${slug}`;
    if (!projects.length) return res.status(404).json({ error: 'project not found' });
    var project = projects[0];

    // Load presta account + user + address
    var prestaAccount = project.freelance_account_id ? (await sql`SELECT * FROM accounts WHERE id = ${project.freelance_account_id}`)[0] : null;
    var prestaUser = project.freelance_account_id ? (await sql`SELECT * FROM users WHERE account_id = ${project.freelance_account_id} LIMIT 1`)[0] : null;
    var prestaAddress = project.freelance_account_id ? (await sql`SELECT * FROM addresses WHERE account_id = ${project.freelance_account_id} AND is_default = true LIMIT 1`)[0] || (await sql`SELECT * FROM addresses WHERE account_id = ${project.freelance_account_id} LIMIT 1`)[0] : null;

    // Load client account + user + address
    var clientAccount = project.client_account_id ? (await sql`SELECT * FROM accounts WHERE id = ${project.client_account_id}`)[0] : null;
    var clientUser = project.client_account_id ? (await sql`SELECT * FROM users WHERE account_id = ${project.client_account_id} LIMIT 1`)[0] : null;
    var clientAddress = project.client_account_id ? (await sql`SELECT * FROM addresses WHERE account_id = ${project.client_account_id} AND is_default = true LIMIT 1`)[0] || (await sql`SELECT * FROM addresses WHERE account_id = ${project.client_account_id} LIMIT 1`)[0] : null;

    // Load features + jobs
    var features = await sql`SELECT * FROM features WHERE project_id = ${project.id} ORDER BY position`;
    for (var i = 0; i < features.length; i++) {
      features[i].jobs = await sql`SELECT * FROM jobs WHERE feature_id = ${features[i].id} ORDER BY position`;
    }

    // Load exclusions
    var exclusions = await sql`SELECT * FROM exclusions WHERE project_id = ${project.id} ORDER BY position`;

    // Load signatures
    var allSigs = await sql`SELECT * FROM devis_signatures WHERE project_id = ${project.id} ORDER BY signed_at DESC`;
    var prestaSigs = allSigs.filter(function(s) { return s.signer_role === 'presta'; });
    var clientSigs = allSigs.filter(function(s) { return s.signer_role !== 'presta'; });

    // Load devis versions for versioning bandeau
    var devisVersions = await sql`SELECT id, version, created_at, previous_version_id, change_summary FROM devis_versions WHERE project_id = ${project.id} ORDER BY created_at DESC`;
    var currentDevisVersion = devisVersions.length ? devisVersions[0] : null;
    var previousDevisVersion = null;
    if (currentDevisVersion && currentDevisVersion.previous_version_id) {
      var pv = devisVersions.filter(function(v) { return v.id === currentDevisVersion.previous_version_id; });
      if (pv.length) previousDevisVersion = pv[0];
    } else if (devisVersions.length > 1) {
      previousDevisVersion = devisVersions[1];
    }

    // Load IBAN (decrypted server-side for PDF)
    var prestaIban = null;
    var prestaBic = null;
    var paymentMethods = project.freelance_account_id ? await sql`SELECT * FROM payment_methods WHERE account_id = ${project.freelance_account_id} AND is_default = true LIMIT 1` : [];
    if (!paymentMethods.length && project.freelance_account_id) {
      paymentMethods = await sql`SELECT * FROM payment_methods WHERE account_id = ${project.freelance_account_id} LIMIT 1`;
    }
    if (paymentMethods.length) {
      prestaIban = formatIban(decryptIban(paymentMethods[0].iban_encrypted));
      prestaBic = paymentMethods[0].bic;
    }

    // Build HTML
    var html = buildDevisHtml({
      project: project,
      presta_account: prestaAccount || {},
      presta_user: prestaUser,
      presta_address: prestaAddress,
      client_account: clientAccount,
      client_user: clientUser,
      client_address: clientAddress,
      features: features,
      exclusions: exclusions,
      presta_signatures: prestaSigs,
      client_signatures: clientSigs,
      presta_iban: prestaIban,
      presta_bic: prestaBic,
      current_version: currentDevisVersion,
      previous_version: previousDevisVersion
    });

    // If ?format=html, return raw HTML for preview
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    // Generate PDF with Puppeteer
    var browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    var page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    var recoloredLogo = (prestaAccount || {}).logo_url ? recolorSvgLogo(prestaAccount.logo_url, (prestaAccount || {}).brand_color || '#0F172A') : null;
    var logoHtml = recoloredLogo
      ? '<img src="' + recoloredLogo + '" style="max-width:50mm;height:10mm;width:auto;object-fit:contain;">'
      : '<span style="font-size:10pt;font-weight:700;color:#0A0A0A;">' + esc((prestaAccount || {}).legal_name || (prestaAccount || {}).name || '') + '</span>';
    var devisHeader = '<div style="width:100%;font-family:Inter,sans-serif;display:flex;justify-content:space-between;align-items:center;padding:4mm 18mm 2mm 18mm;border-bottom:0.5px solid #E5E7EB;">'
      + '<span>' + logoHtml + '</span>'
      + '<span style="font-size:7pt;color:#9CA3AF;">' + esc(project.ref_number || '') + '</span>'
      + '</div>';
    var devisFooter = '<div style="width:100%;font-family:Inter,sans-serif;font-size:7pt;color:#9CA3AF;display:flex;justify-content:space-between;padding:0 18mm;">'
      + '<span>' + esc(project.ref_number || '') + ' — ' + esc((project.title || '').substring(0, 60)) + '</span>'
      + '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
      + '<span>' + esc((prestaAccount || {}).legal_name || (prestaAccount || {}).name || '') + '</span>'
      + '</div>';
    var pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: devisHeader,
      footerTemplate: devisFooter,
      margin: { top: '32mm', right: '18mm', bottom: '28mm', left: '18mm' }
    });
    await browser.close();

    var buf = Buffer.from(pdfBuffer);

    // If ?notify=1, send signed PDF by email to both parties
    if (req.query.notify === '1') {
      // Store frozen PDF blob
      var latestClientSig = clientSigs.length ? clientSigs[0] : null;
      if (latestClientSig) {
        await sql`UPDATE devis_signatures SET pdf_blob = ${buf} WHERE id = ${latestClientSig.id}`;
      }

      var pdfBase64 = buf.toString('base64');
      var filename = 'devis-signe-' + slug + '.pdf';
      var lastClientSig = clientSigs.length ? clientSigs[0] : null;
      var signerName = lastClientSig ? lastClientSig.signer_name : 'Signataire';
      var signedAtStr = lastClientSig ? new Date(lastClientSig.signed_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }) : '';
      var devisHash = lastClientSig ? lastClientSig.devis_hash : '';

      var emailHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
        + '<body style="margin:0;padding:0;background:#f4f3ee;font-family:-apple-system,system-ui,sans-serif;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ee;padding:32px 16px;"><tr><td align="center">'
        + '<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">'
        + '<tr><td style="padding:0 0 24px;"><table width="100%"><tr>'
        + '<td style="font-size:18px;font-weight:700;color:#2d2b35;letter-spacing:-0.03em;">'
        + '<img src="https://iron-seal.vercel.app/seal-logo.png" width="22" height="22" alt="" style="vertical-align:middle;margin-right:5px;">iron seal</td>'
        + '<td align="right" style="font-size:11px;color:#b1ada1;">Proposition &amp; signature en ligne</td>'
        + '</tr></table></td></tr>'
        + '<tr><td style="background:white;border-radius:10px;padding:32px 36px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">'
        + '<p style="margin:0 0 12px;text-align:center;"><span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#166534;">Document signé</span></p>'
        + '<h2 style="font-size:20px;font-weight:700;color:#2d2b35;margin:0 0 16px;line-height:1.3;">' + esc(project.title) + '</h2>'
        + '<p style="font-size:14px;color:#4a4850;line-height:1.7;margin:0 0 16px;">Ce devis a été signé électroniquement par <strong>' + esc(signerName) + '</strong>.</p>'
        + '<table width="100%" style="background:#f9f8f6;border-radius:8px;margin:0 0 16px;"><tr><td style="padding:16px 20px;">'
        + '<p style="font-size:13px;color:#4a4850;margin:0 0 6px;"><strong>Date :</strong> ' + signedAtStr + '</p>'
        + '<p style="font-size:13px;color:#4a4850;margin:0 0 6px;"><strong>Signataire :</strong> ' + esc(signerName) + '</p>'
        + '<p style="font-size:11px;color:#8a8780;margin:0;word-break:break-all;"><strong>Hash :</strong> ' + (devisHash || '').substring(0, 32) + '...</p>'
        + '</td></tr></table>'
        + '<p style="font-size:13px;color:#6b6560;line-height:1.6;margin:0;">Le PDF signé est joint à cet email et disponible depuis l\'interface Iron Seal.</p>'
        + '</td></tr>'
        + '<tr><td style="padding:24px 0 0;text-align:center;">'
        + '<p style="font-size:11px;color:#b1ada1;margin:0 0 6px;">Iron Seal par Blue Heron Lab</p>'
        + '</td></tr></table></td></tr></table></body></html>';

      var attachments = [{ filename: filename, content: pdfBase64 }];

      async function sendSignedEmail(to, subject) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.RESEND_KEY },
          body: JSON.stringify({ from: 'Iron Seal <notifications@mail.blueheronlab.com>', to: to, subject: subject, html: emailHtml, attachments: attachments })
        });
      }

      // Send to presta
      if (prestaUser && prestaUser.email) {
        await sendSignedEmail(prestaUser.email, 'Devis signé : ' + project.title);
      }
      // Send to client
      if (clientUser && clientUser.email) {
        await sendSignedEmail(clientUser.email, 'Confirmation de signature : ' + project.title);
      }

      return res.json({ ok: true, emailed: true });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', 'inline; filename="' + (project.ref_number || 'devis') + '.pdf"');
    res.statusCode = 200;
    res.end(buf);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
