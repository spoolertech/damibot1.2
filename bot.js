const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Estado del usuario
let userStates = {};

// Inicializamos la sesión
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
    const { connection, lastDisconnect } = update;
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

    // Lógica de conversación similar a tu flujo anterior
    const response = await handleMessage(from, text.trim().toLowerCase());
    if (response) {
      await sock.sendMessage(from, { text: response });
    }
  });
}

// Flujo de conversación (simplificado)
async function handleMessage(from, text) {
  if (!userStates[from]) {
    userStates[from] = { step: 0, responses: {} };
  }

  const user = userStates[from];

  switch (user.step) {
    case 0:
      if (text.includes('hola')) {
        user.step = 1;
        return '👋 ¡Bienvenido! Por favor, decime tu *Nombre* y *Lote* (ej: Juan Pérez Lote 123)';
      }
      break;

    case 1:
      const parts = text.split(' ');
      user.responses.name = parts.slice(0, parts.length - 2).join(' ');
      user.responses.lot = parts.slice(-2).join(' ');
      user.step = 2;
      return '🏓 ¿En qué cancha vas a jugar? Responde con *1*, *2* o *3*';

    case 2:
      if (['1', '2', '3'].includes(text)) {
        user.responses.court = text;
        user.step = 3;
        return '👥 ¿Tenés invitados sin carnet? Responde *SI* o *NO*';
      } else {
        return '⚠️ Por favor ingresá *1*, *2* o *3*';
      }

    case 3:
      if (text === 'si' || text === 'sí') {
        user.responses.hasGuests = true;
        user.step = 4;
        return '🔢 ¿Cuántos invitados? (1, 2 o 3)';
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
        return '👤 Ingresá el nombre y lote del invitado 1';
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
  let resumen = `🎾 *Detalle de la Reserva*\n\n👤 Nombre y Lote: *${data.name} ${data.lot}*\n🏓 Cancha: *${data.court}*\n`;
  if (data.hasGuests) {
    resumen += `👥 Invitados: *${data.guestCount}*\n`;
    data.guests.forEach((g, i) => resumen += `👥 Invitado ${i + 1}: ${g}\n`);
  } else {
    resumen += `👥 Invitados: *No*`;
  }

  resumen += `\n🎾🎾🎾 Gracias por la info ❤️ ¡Todo listo para jugar!\nNo olvides hacer tu reserva en Padelink.`;

  return resumen;
}

app.get('/', (req, res) => {
  res.send('✅ Bot de WhatsApp activo');
});

app.listen(port, () => {
  console.log(`🌐 Servidor web corriendo en puerto ${port}`);
});

connectToWhatsApp();
