// server.cjs

// === MODELO DE CÁLCULO ===
// Metodologia: Implementação do Modelo de Design Web Sustentável (SWDM) v4.
// Inclui ajustes para cache/visitantes recorrentes e localização regional.
// Este é o mesmo modelo padrão da indústria adotado pela Website Carbon Calculator em Jul/2025.
// Última revisão: 15/07/2025

require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const { install } = require('@puppeteer/browsers');
const cors =require("cors");
const dns = require("dns").promises;
const nodemailer = require("nodemailer");
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

const app = express();

// Ativa o 'trust proxy' para que req.ip retorne o IP real do usuário, mesmo atrás de um proxy como o do Render.
app.set('trust proxy', true);

async function fetchWithTimeout(url, timeout = 90000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`A requisição para ${url} demorou mais de ${timeout / 1000} segundos.`);
        }
        throw error;
    }
}

// Função para obter a intensidade de carbono (gCO2e/kWh) por código de país.
// Fonte: Ember - Global Electricity Review 2024 (Dados de 2023). A média global é usada como padrão.
function getCarbonIntensityByCountryCode(countryCode) {
    const intensities = {
        // Américas
        BR: 63,    // Brasil
        US: 367,   // Estados Unidos
        CA: 122,   // Canadá
        MX: 442,   // México
        AR: 295,   // Argentina
        // Europa
        FR: 87,    // França
        DE: 421,   // Alemanha
        GB: 206,   // Reino Unido
        ES: 167,   // Espanha
        PT: 164,   // Portugal
        PL: 738,   // Polônia (Exemplo de alta intensidade)
        // Ásia
        CN: 598,   // China
        IN: 699,   // Índia
        JP: 462,   // Japão
        KR: 418,   // Coreia do Sul
        // Oceania
        AU: 531,   // Austrália
        // Padrão Global
        GLOBAL: 466 // Média Global 2023 (Ember)
    };
    return intensities[countryCode] || intensities["GLOBAL"];
}


app.use(cors({
  origin: 'https://aplicacoes.tec.br',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.post("/calculate", async (req, res) => {
  const { url, nome, celular, email } = req.body;

  let browser;

  try {
    console.log('Verificando e instalando o navegador Chromium...');
    const installedBrowser = await install({
        browser: 'chrome',
        buildId: '126.0.6478.126',
        cacheDir: '.cache/puppeteer'
    });
    console.log('Navegador pronto para uso em:', installedBrowser.executablePath);
    
    const hostname = new URL(url).hostname;

    // --- OBTENÇÃO DE DADOS ---
    console.log(`Verificando Green Web para: ${hostname}`);
    const greenCheckRes = await fetchWithTimeout(`https://api.thegreenwebfoundation.org/greencheck/${hostname}`);
    const greenCheckData = await greenCheckRes.json();
    console.log('Verificação Green Web concluída.');

    const isGreen = greenCheckData.green || false;
    const hostedBy = greenCheckData.hostedby || "Desconhecido";
    const hostedByURL = greenCheckData.hostedbywebsite || "";
    const greenFactor = isGreen ? 0 : 1.0;

    let serverIp = "";
    try {
      const addresses = await dns.lookup(hostname);
      serverIp = addresses.address;
    } catch (e){
      console.log('Não foi possível obter o endereço de IP do servidor via DNS.');
    }

    let cidadeServidor = "Indefinido", paisServidor = "Indefinido", orgServidor = "Desconhecido";
    if (serverIp) {
      try {
        console.log(`Verificando IP-API para o servidor: ${serverIp}`);
        const ipApiRes = await fetchWithTimeout(`http://ip-api.com/json/${serverIp}`);
        const ipData = await ipApiRes.json();
        cidadeServidor = ipData.city || "Indefinido";
        paisServidor = ipData.countryCode || "Indefinido";
        orgServidor = ipData.org || "Desconhecido";
        console.log('Verificação IP-API do servidor concluída.');
      } catch (e){
        console.log('Falha ao consultar a API de IP do servidor:', e.message);
      }
    }

    console.log('Iniciando Puppeteer...');
    browser = await puppeteer.launch({
      executablePath: installedBrowser.executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    console.log(`Navegando para: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    console.log('Página carregada. Coletando recursos...');

    const resources = await page.evaluate(() => {
      return performance.getEntriesByType("resource").map(r => ({
        name: r.name,
        transferSize: r.transferSize,
        initiatorType: r.initiatorType
      }));
    });
    console.log(`Recursos coletados: ${resources.length} itens. Iniciando cálculos...`);

    const pageWeightBytes = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    const pageWeightMB = pageWeightBytes / (1024 * 1024);

    // --- INÍCIO DA LÓGICA DE CÁLCULO SWDM v4 REGIONAL ---

    // 1. Obter intensidade de carbono com base na localização
    const userIp = req.ip;
    let userCountryCode = 'GLOBAL'; // Padrão
    if (userIp) {
      try {
        const userIpRes = await fetchWithTimeout(`http://ip-api.com/json/${userIp}`);
        const userIpData = await userIpRes.json();
        if (userIpData.status === 'success') {
          userCountryCode = userIpData.countryCode;
        }
      } catch (e) {
        console.log('Falha ao obter geolocalização do IP do usuário. Usando padrão global.', e.message);
      }
    }

    const gridIntensityGlobal = getCarbonIntensityByCountryCode('GLOBAL');
    const gridIntensityServer = getCarbonIntensityByCountryCode(paisServidor);
    const gridIntensityUser = getCarbonIntensityByCountryCode(userCountryCode);

    // 2. Coeficientes de Intensidade Energética (kWh/GB) do SWDM v4, convertidos para kWh/MB
    const opEnergyIntensityDC = 0.055 / 1024;
    const opEnergyIntensityN = 0.059 / 1024;
    const opEnergyIntensityUD = 0.080 / 1024;
    const emEnergyIntensityDC = 0.012 / 1024;
    const emEnergyIntensityN = 0.013 / 1024;
    const emEnergyIntensityUD = 0.081 / 1024;

    // 3. Cálculo das Emissões com intensidade regional
    // Emissões operacionais
    const opDC = pageWeightMB * opEnergyIntensityDC * gridIntensityServer * greenFactor;
    const opN = pageWeightMB * opEnergyIntensityN * gridIntensityUser;
    const opUD = pageWeightMB * opEnergyIntensityUD * gridIntensityUser;
    const operationalEmissions = opDC + opN + opUD;

    // Emissões incorporadas (SEMPRE usam a média global)
    const emDC = pageWeightMB * emEnergyIntensityDC * gridIntensityGlobal;
    const emN = pageWeightMB * emEnergyIntensityN * gridIntensityGlobal;
    const emUD = pageWeightMB * emEnergyIntensityUD * gridIntensityGlobal;
    const embodiedEmissions = emDC + emN + emUD;
    
    // 4. Emissão total antes do ajuste de cache
    const initialEmissionPerVisit = operationalEmissions + embodiedEmissions;

    // 5. Aplicar Fator de Ajuste de Cache/Visitantes Recorrentes (padrão 0.75)
    const cacheAdjustmentFactor = 0.75;
    const emissionPerVisit = initialEmissionPerVisit * cacheAdjustmentFactor;

    // Estimativa de energia por visita
    const totalEnergyIntensity = opEnergyIntensityDC + opEnergyIntensityN + opEnergyIntensityUD + emEnergyIntensityDC + emEnergyIntensityN + emEnergyIntensityUD;
    const energiaEstimativaKWh = pageWeightMB * totalEnergyIntensity * cacheAdjustmentFactor;

    // --- FIM DA LÓGICA DE CÁLCULO ---

    const rating = (() => {
      if (emissionPerVisit <= 0.040) return "A+";
      if (emissionPerVisit <= 0.079) return "A";
      if (emissionPerVisit <= 0.145) return "B";
      if (emissionPerVisit <= 0.209) return "C";
      if (emissionPerVisit <= 0.278) return "D";
      if (emissionPerVisit <= 0.359) return "E";
      return "F";
    })();
    
    console.log('Cálculos finalizados. Preparando para enviar e-mail...');
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.hostinger.com",
        port: 465,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });
      
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "Novo lead - Calculadora de Carbono",
        html: `
          <h2>📩 Novo lead - Calculadora de Carbono</h2>
          <p><strong>Nome:</strong> ${nome}</p>
          <p><strong>Celular:</strong> ${celular}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>URL:</strong> ${url}</p>
          <hr>
          <p><strong>🌿 Emissão estimada:</strong> ${emissionPerVisit.toFixed(3)} g CO₂/visita (ajustado para cache)</p>
          <p><strong>⚡ Energia estimada:</strong> ${energiaEstimativaKWh.toFixed(5)} kWh</p>
          <p><strong>📊 Classificação:</strong> ${rating}</p>
          <hr>
          <p><strong>💾 Peso da página:</strong> ${pageWeightMB.toFixed(2)} MB</p>
          <p><strong>🛰️ Localização do servidor:</strong> ${cidadeServidor}, ${paisServidor} (Intensidade: ${gridIntensityServer} g/kWh)</p>
          <p><strong>👤 Localização do usuário:</strong> ${userCountryCode} (Intensidade: ${gridIntensityUser} g/kWh)</p>
          <p><strong>🏢 Provedor:</strong> ${orgServidor}</p>
          <p><strong>♻️ Hospedagem verde:</strong> ${isGreen ? "✅ Sim" : "❌ Não"} – ${hostedBy} (${hostedByURL})</p>
        `
      });
      console.log('E-mail enviado com sucesso.');
    } catch (mailErr) {
      console.error("Erro ao enviar e-mail:", mailErr.message);
    }

    console.log('Enviando resposta para o cliente...');
    res.json({
      emissao: emissionPerVisit,
      energia: energiaEstimativaKWh,
      rating,
      green: isGreen,
      hostedby: hostedBy,
      hostedbywebsite: hostedByURL,
      servidor: {
        cidade: cidadeServidor,
        pais: paisServidor,
        org: orgServidor
      },
      pageWeightMB: pageWeightMB.toFixed(2)
    });

  } catch (error) {
    console.error("Erro no /calculate:", error.message);
    res.status(500).json({ error: "Falha ao calcular emissões. O site pode estar indisponível ou ser muito complexo." });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Processo finalizado. Navegador fechado.');
    }
  }
});

// ROTA PARA GERAR O SELO (SEM ALTERAÇÕES)
app.get('/generate-badge', async (req, res) => {
    try {
        const { domain, comparison } = req.query;
        if (!domain || !comparison) {
            return res.status(400).send('Parâmetros "domain" e "comparison" são obrigatórios.');
        }
        const assetsPath = path.join(__dirname, 'assets');
        registerFont(path.join(assetsPath, 'Anta-Regular.ttf'), { family: 'Anta' });
        const templatePath = path.join(assetsPath, 'badge-template.png');
        const image = await loadImage(templatePath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);
        ctx.fillStyle = '#E0E0E0';
        ctx.font = '10px "Anta"';
        ctx.textAlign = 'left';
        ctx.fillText(domain, 12, 43);
        ctx.fillStyle = '#B0B0B0';
        ctx.font = '7.5px "Anta"';
        ctx.fillText(comparison, 12, 55);
        res.setHeader('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);
    } catch (error) {
        console.error('Erro ao gerar o selo:', error);
        res.status(500).send('Erro ao gerar a imagem do selo.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));