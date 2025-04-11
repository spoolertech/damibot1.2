const { chromium } = require('playwright'); // Usamos Playwright
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
const port = process.env.PORT || 3000;

class WhatsAppBot {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await chromium.launch({ headless: false }); // Cambié headless a false para ver el navegador
    const context = await this.browser.newContext();
    this.page = await context.newPage();
    await this.page.goto('https://web.whatsapp.com/');

    // Esperamos a que el QR aparezca
    await this.page.waitForSelector('canvas[aria-label="Scan me!"]', { timeout: 0 });

    // Genera el QR para el login
    const qrCodeUrl = await this.page.$eval('canvas[aria-label="Scan me!"]', canvas => canvas.toDataURL());
    qrcode.generate(qrCodeUrl, { small: true });

    console.log('👋 Escaneá este QR para iniciar sesión.');
  }

  async sendMessage(contact, message) {
    // Buscar el contacto o grupo
    const searchBox = await this.page.$('div[contenteditable="true"][data-tab="3"]');
    await searchBox.click();
    await searchBox.type(contact);

    // Esperamos un poco para que se cargue el chat
    await this.page.waitForTimeout(1000);

    // Seleccionamos el primer resultado de búsqueda
    const firstResult = await this.page.$('span[title="' + contact + '"]');
    if (firstResult) {
      await firstResult.click();
      const messageBox = await this.page.$('div[contenteditable="true"][data-tab="1"]');
      await messageBox.type(message);
      const sendButton = await this.page.$('span[data-icon="send"]');
      await sendButton.click();
    } else {
      console.log('❌ Contacto no encontrado.');
    }
  }
}

const bot = new WhatsAppBot();

bot.initialize().then(() => {
  console.log('✅ WhatsApp Web está listo.');
}).catch(err => {
  console.error('❌ Error al iniciar WhatsApp Web:', err);
});

// Estado de conversación por usuario
let userStates = {};

async function handleMessage(msg) {
  const from = msg.from;
  const text = msg.body.trim().toLowerCase();

  if (!userStates[from]) {
    userStates[from] = { step: 0, responses: {} };
  }

  const user = userStates[from];

  switch (user.step) {
    case 0:
      if (text.includes('hola')) {
        await bot.sendMessage(from, '👋 ¡Bienvenido a Villanueva Padel!\n\n👉 Por favor, ingresá tu *Nombre* y *Lote* en este formato:\n\n*Juan Pérez Lote 123*');
        user.step = 1;
      }
      break;

    case 1:
      const parts = text.split(' ');
      user.responses.name = parts.slice(0, parts.length - 2).join(' ');
      user.responses.lot = parts.slice(-2).join(' ');
      await bot.sendMessage(from, '🏓 ¿En qué cancha vas a jugar? Responde con *1*, *2* o *3*');
      user.step = 2;
      break;

    case 2:
      if (['1', '2', '3'].includes(text)) {
        user.responses.court = text;
        await bot.sendMessage(from, '👥 ¿Tenés invitados sin carnet? Responde *SI* o *NO*');
        user.step = 3;
      } else {
        await bot.sendMessage(from, '⚠️ Por favor ingresá *1*, *2* o *3*.');
      }
      break;

    case 3:
      if (text === 'si' || text === 'sí') {
        user.responses.hasGuests = true;
        await bot.sendMessage(from, '🔢 ¿Cuántos invitados? (1, 2 o 3)');
        user.step = 4;
      } else if (text === 'no') {
        user.responses.hasGuests = false;
        sendSummary(from, user.responses);
        userStates[from] = null;
      } else {
        await bot.sendMessage(from, '⚠️ Por favor respondé *SI* o *NO*.');
      }
      break;

    case 4:
      if (['1', '2', '3'].includes(text)) {
        user.responses.guestCount = parseInt(text);
        user.responses.guests = [];
        await bot.sendMessage(from, '👤 Ingresá el nombre y lote del invitado 1 (Ej: Ana Gómez Lote 456)');
        user.step = 5;
      } else {
        await bot.sendMessage(from, '⚠️ Por favor indicá *1*, *2* o *3*.');
      }
      break;

    case 5:
      user.responses.guests.push(text);
      if (user.responses.guests.length < user.responses.guestCount) {
        await bot.sendMessage(from, `👤 Ingresá el nombre y lote del invitado ${user.responses.guests.length + 1}`);
      } else {
        sendSummary(from, user.responses);
        userStates[from] = null;
      }
      break;

    default:
      await bot.sendMessage(from, '🧐 No entendí eso. Escribí *hola* para comenzar.');
      user.step = 0;
      break;
  }
}

function sendSummary(contact, data) {
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

  * Este sistema NO REEMPLAZA a la reserva por PADELINK, si no la hiciste, hacela así nadie te pide la cancha 😡 mientras estés jugando 🏓.

  Gracias por elegirnos 😍😍!! Disfruten el partido!!!`;

  bot.sendMessage(contact, resumen);
}

app.get('/', (req, res) => {
  res.send('✅ Bot de WhatsApp en funcionamiento.');
});

app.listen(port, () => {
  console.log(`🌐 Servidor web corriendo en puerto ${port}`);
});
