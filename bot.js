const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const qrcodeWeb = require('qrcode');
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const db = require('./firebase');

const app = express();
const port = process.env.PORT || 3000;
let lastGeneratedQR = null;

let userStates = {};

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastGeneratedQR = qr;
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔁 Reintentando conexión...');
        connectToWhatsApp();
      } else {
        console.log('❌ Usuario desconectado');
      }
    } else if (connection === 'open') {
      console.log('✅ Conectado a WhatsApp');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    const response = await handleMessage(from, text.trim().toLowerCase());
    if (response) {
      await sock.sendMessage(from, { text: response });
    }
  });
}

async function handleMessage(from, text) {
  if (!userStates[from]) {
    userStates[from] = { step: 0, responses: {}, attempts: {} };
  }

  const user = userStates[from];

  switch (user.step) {
    case 0:
      if (text.includes('hola')) {
        user.step = 1;
        return '👋 ¡Bienvenido a Villanueva Padel! 🎾🎾🎾\n\n👉 Por favor, ingresá tu *Nombre* y *Lote* en este formato:\n\n*Juan Pérez Lote 123*';
      }
      break;

    case 1:
      const parts = text.trim().split(' ');
      user.responses.name = parts.slice(0, parts.length - 2).join(' ');
      user.responses.lot = parts.slice(-2).join(' ');
      user.step = 2;
      return '🥳  Ahora Ingresa en qué cancha vas a jugar. Responde con *1*, *2* o *3*';

    case 2:
      if (['1', '2', '3'].includes(text)) {
        user.responses.court = text;
        user.step = 3;
        return '⚠️ ¿Tenés invitados sin carnet para declarar?  👥👥 Responde *SI* o *NO*';
      } else {
        user.attempts.court = (user.attempts.court || 0) + 1;
        if (user.attempts.court < 2) {
          return '❌ Opción inválida. Por favor ingresa *1*, *2* o *3*. Intento ' + (user.attempts.court + 1) + ' de 2.';
        } else {
          user.step = 0;
          user.attempts = {};
          return '⚠️ Has superado el límite de intentos. El proceso se reiniciará desde el comienzo. Escribí *hola* para empezar de nuevo.';
        }
      }

    case 3:
      if (text === 'si' || text === 'sí') {
        user.responses.hasGuests = true;
        user.step = 4;
        return '👥 ¿Cuántos invitados sin Carnet tenes ❓❓❓ Responde con *1*, *2* o *3*';
      } else if (text === 'no') {
        user.responses.hasGuests = false;
        const resumen = generateSummary(user.responses);
        userStates[from] = null;
        return resumen;
      } else {
        return '⚠️ Por favor respondé *SI* o *NO*';
      }

    case 4:
      if (['1', '2', '3'].includes(text)) {
        user.responses.guestCount = parseInt(text);
        user.responses.guests = [];
        user.step = 5;
        return '🙋🏼  Ingresá el nombre y lote del invitado 1';
      } else {
        return '⚠️ Indicá *1*, *2* o *3*';
      }

    case 5:
      user.responses.guests.push(text);
      if (user.responses.guests.length < user.responses.guestCount) {
        return `👤 Ingresá el nombre y lote del invitado ${user.responses.guests.length + 1}`;
      } else {
        const resumen = generateSummary(user.responses);
        userStates[from] = null;
        return resumen;
      }

    default:
      user.step = 0;
      return '🧐 No entendí eso. Escribí *hola* para comenzar.';
  }
}

function generateSummary(data) {
  let resumen = `🎾 *Detalle de la Reserva*🎾\n\n👤 Nombre y Lote: *${data.name} ${data.lot}*\n🏓 Cancha Reservada: *${data.court}*\n`;

  if (data.hasGuests) {
    resumen += `👥 Invitados: *${data.guestCount}*\n`;
    data.guests.forEach((g, i) => {
      resumen += `👥 Cantidad de Invitados ${i + 1}: ${g}\n`;
    });
  } else {
    resumen += `👥 Invitados: *No*`;
  }

  resumen += `\n🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾
Gracias por la info!!! ❤️ Todo listo! Ahora podés comenzar a jugar‼️.

* 🤔 Recordá, si todavía no pasaste, que si querés abonar en efectivo podés acercarte a la oficina y hacerlo. De lo contrario te lo podemos cargar por expensas! 📩

* Este sistema NO REEMPLAZA a la reserva por PADELINK, si no la hiciste, hacela así nadie te pide la cancha 😡 mientras estés jugando 🏓.

Gracias por elegirnos 😍😍!! Disfruten el partido!!!`;

  db.ref('reservas').push({
    nombre: data.name,
    lote: data.lot,
    cancha: data.court,
    invitados: data.hasGuests ? data.guests : [],
    cantidad_invitados: data.guestCount || 0,
    timestamp: new Date().toISOString()
  }).then(() => {
    console.log('✅ Reserva subida a Firebase');
  }).catch((err) => {
    console.error('❌ Error al subir a Firebase:', err);
  });

  return resumen;
}

app.get('/', (req, res) => {
  res.send('✅ Bot de WhatsApp activo');
});

app.get('/qr', async (req, res) => {
  if (!lastGeneratedQR) {
    return res.status(404).send('QR no disponible todavía.');
  }

  const qrDataUrl = await qrcodeWeb.toDataURL(lastGeneratedQR);
  res.send(`
    <html>
      <head><title>QR de WhatsApp</title></head>
      <body>
        <h1>Escaneá el QR para vincular WhatsApp</h1>
        <img src="${qrDataUrl}" />
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`🌐 Servidor web corriendo en puerto ${port}`);
});

connectToWhatsApp();

const keepAliveUrl = 'https://b3bb658c-3da2-4442-a567-e891c2d634a1-00-hjjwslmg8fdu.kirk.replit.dev/'; // 

setInterval(() => {
  axios.get(keepAliveUrl)
    .then(() => console.log('✅ Ping de keep-alive enviado'))
    .catch(err => console.error('❌ Error en el ping de keep-alive:', err.message));
}, 1000 * 60 * 5);
