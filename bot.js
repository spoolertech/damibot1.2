const { Client } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
let qrCodeData = null;

// Estado de usuarios
let userStates = {};

// Iniciar cliente WhatsApp
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox'],
  },
});

// QR
client.on('qr', (qr) => {
  console.log('📱 QR generado');
  qrCodeData = qr;
});

// Listo
client.on('ready', () => {
  console.log('✅ Cliente conectado a WhatsApp');
  qrCodeData = null;
  console.log('Bot listo para recibir mensajes.'); // Asegúrate de ver este log
});

// Lógica de mensajes
client.on('message', async (msg) => {
  try {
    console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`); // Log para ver los mensajes que el bot recibe
    const from = msg.from;
    const text = msg.body.trim().toLowerCase();

    if (!userStates[from]) {
      userStates[from] = { step: 0, responses: {} };
    }

    const user = userStates[from];

    switch (user.step) {
      case 0:
        if (text.includes('hola')) {
          msg.reply('👋 ¡Bienvenido a Villanueva Padel!\n\n👉 Por favor, ingresá tu *Nombre* y *Lote* en este formato:\n\n*Juan Pérez Lote 123*');
          user.step = 1;
        }
        break;

      case 1:
        const parts = msg.body.split(' ');
        user.responses.name = parts.slice(0, parts.length - 2).join(' ');
        user.responses.lot = parts.slice(-2).join(' ');
        msg.reply('🏓 ¿En qué cancha vas a jugar? Responde con *1*, *2* o *3*');
        user.step = 2;
        break;

      case 2:
        if (['1', '2', '3'].includes(text)) {
          user.responses.court = text;
          msg.reply('👥 ¿Tenés invitados sin carnet? Responde *SI* o *NO*');
          user.step = 3;
        } else {
          msg.reply('⚠️ Por favor ingresá *1*, *2* o *3*.');
        }
        break;

      case 3:
        if (text === 'si' || text === 'sí') {
          user.responses.hasGuests = true;
          msg.reply('🔢 ¿Cuántos invitados? (1, 2 o 3)');
          user.step = 4;
        } else if (text === 'no') {
          user.responses.hasGuests = false;
          sendSummary(msg, user.responses);
          userStates[from] = null;
        } else {
          msg.reply('⚠️ Por favor respondé *SI* o *NO*.');
        }
        break;

      case 4:
        if (['1', '2', '3'].includes(text)) {
          user.responses.guestCount = parseInt(text);
          user.responses.guests = [];
          msg.reply('👤 Ingresá el nombre y lote del invitado 1 (Ej: Ana Gómez Lote 456)');
          user.step = 5;
        } else {
          msg.reply('⚠️ Por favor indicá *1*, *2* o *3*.');
        }
        break;

      case 5:
        user.responses.guests.push(msg.body);
        if (user.responses.guests.length < user.responses.guestCount) {
          msg.reply(`👤 Ingresá el nombre y lote del invitado ${user.responses.guests.length + 1}`);
        } else {
          sendSummary(msg, user.responses);
          userStates[from] = null;
        }
        break;

      default:
        msg.reply('🧐 No entendí eso. Escribí *hola* para comenzar.');
        user.step = 0;
        break;
    }
  } catch (error) {
    console.error('Error en el procesamiento del mensaje:', error); // Captura errores
  }
});

// Enviar resumen
function sendSummary(msg, data) {
  let resumen = `🎾 *Detalle de la Reserva*\n\n👤 Nombre y Lote: *${data.name} ${data.lot}*\n🏓 Cancha: *${data.court}*\n`;

  if (data.hasGuests) {
    resumen += `👥 Invitados: *${data.guestCount}*\n`;
    data.guests.forEach((guest, i) => {
      resumen += `👥 Invitado ${i + 1}: ${guest}\n`;
    });
  } else {
    resumen += `👥 Invitados: *No*`;
  }

  resumen += `\n🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾
  Gracias por la info!!! ❤️ Todo listo! Ahora podés comenzar a jugar‼️.
  
  * 🤔 Recordá, si todavía no pasaste, que si querés abonar en efectivo podes acercarte a la oficina y hacerlo. De lo contrario te lo podemos cargar por expensas! 📩
  
  * Este sistema NO REEMPLAZA a la reserva por PADELINK, si no la hiciste, hacela así nadie te pide la cancha 😡 mientras estes jugando 🏓.
  
  Gracias por elegirnos 😍😍!! Disfruten el partido!!!
  
  🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾🎾`;

  msg.reply(resumen);
}

// Servidor Express
const PORT = process.env.PORT || 3000; // Usa el puerto dinámico de Render

app.get('/', async (req, res) => {
  if (qrCodeData) {
    const qrImage = await qrcode.toDataURL(qrCodeData);
    res.send(`<h2>Escaneá el código QR:</h2><img src="${qrImage}" alt="QR">`);
  } else {
    res.send(`<h2>✅ Ya estás conectado a WhatsApp.</h2>`);
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🌐 Servidor Express en http://localhost:${PORT}`);
});

client.initialize();
