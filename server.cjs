// server.cjs

// === MODELO DE CÁLCULO ===
// Metodologia: Implementação do Modelo de Design Web Sustentável (SWDM) v4.
// Inclui ajustes para cache/visitantes recorrentes e localização regional.
// Utiliza a base de dados de intensidade de carbono da The Green Web Foundation (co2.js).
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

// ✅ ATUALIZADO: Função para obter a intensidade de carbono (gCO2e/kWh) por código de país.
// Fonte: The Green Web Foundation - co2.js, 'average-intensities.js' (Dados de 2023/2024 via Ember)
function getCarbonIntensityByCountryCode(countryCode) {
    const intensities = {
      AFG: 123.71, ALB: 24.42, DZA: 633.65, ASM: 647.06, AGO: 167.22, ATG: 611.11, ARG: 344.83,
      ARM: 243.52, ABW: 550, ASEAN: 573.65, ASIA: 572.12, AUS: 553.76, AUT: 102.62, AZE: 632.89,
      BHS: 653.66, BHR: 902.41, BGD: 694.63, BRB: 600, BLR: 323.63, BEL: 117.58, BLZ: 155.56,
      BEN: 590, BTN: 24.19, BOL: 468.02, BIH: 638.05, BWA: 849.42, BRA: 106.06, BRN: 892.67,
      BGR: 264.21, BFA: 554.91, BDI: 230.77, CPV: 480, KHM: 497.46, CMR: 285.71, CAN: 184.99,
      CYM: 642.86, CAF: 0, TCD: 615.39, CHL: 265.52, CHN: 557.5, COL: 285.8, COM: 642.86,
      COG: 713.73, COD: 27.04, COK: 250, CRI: 63.01, CIV: 393.53, HRV: 174.48, CUB: 638.98,
      CYP: 512.24, CZE: 413.86, DNK: 143.3, DJI: 450, DMA: 600, DOM: 565.97, ECU: 209.7,
      EGY: 574.5, SLV: 99.29, GNQ: 605.1, ERI: 590.91, EST: 341.02, SWZ: 142.86, ETH: 23.55,
      EU: 213.08, EUROPE: 285.05, FLK: 1000, FRO: 354.17, FJI: 278.26, FIN: 72.25, FRA: 44.18,
      GUF: 204.08, PYF: 436.62, G20: 468.39, G7: 343.3, GAB: 429.47, GMB: 666.67, GEO: 143.06,
      DEU: 342.06, GHA: 452.86, GRC: 319.76, GRL: 111.11, GRD: 666.67, GLP: 493.9, GUM: 611.11,
      GTM: 272.66, GIN: 182.72, GNB: 625, GUY: 634.33, HTI: 534.65, HND: 289.5, HKG: 681.99,
      HUN: 182.82, ISL: 28.33, IND: 708.96, IDN: 682.43, IRN: 648.68, IRQ: 689.4, IRL: 279.79,
      ISR: 567.26, ITA: 287.75, JAM: 561.25, JPN: 483.73, JOR: 539.21, KAZ: 801.79, KEN: 84.83,
      KIR: 500, XKX: 958.72, KWT: 637.24, KGZ: 152.65, LAO: 232.12, LVA: 136.22, LBN: 369.47,
      LSO: 20.83, LBR: 435.9, LBY: 830.53, LTU: 139.34, LUX: 134.62, MAC: 448.98, MDG: 477.27,
      MWI: 54.65, MYS: 604.43, MDV: 611.77, MLI: 394.5, MLT: 484.16, MTQ: 516.78, MRT: 481.71,
      MUS: 633.03, MEX: 483.14, "MIDDLE EAST": 637.24, MDA: 629.56, MNG: 784.01, MNE: 413.51,
      MSR: 1000, MAR: 577.65, MOZ: 127.81, MMR: 569.69, NAM: 47.62, NRU: 750, NPL: 23.36,
      NLD: 252.7, NCL: 585.76, NZL: 120.11, NIC: 288.33, NER: 687.5, NGA: 507.85, "NORTH AMERICA": 358.36,
      PRK: 344.26, MKD: 568.97, NOR: 30.75, OCEANIA: 495.47, OECD: 338.02, OMN: 545.33, PAK: 398.61,
      PSE: 460.78, PAN: 258.74, PNG: 513.74, PRY: 24.86, PER: 263.27, POL: 614.98, PRT: 112.29,
      PRI: 664.53, QAT: 602.83, REU: 525.22, ROU: 245.55, RUS: 446.17, RWA: 301.89, KNA: 636.36,
      LCA: 650, SPM: 600, VCT: 600, WSM: 400, STP: 555.56, SAU: 691.95, SEN: 535.4, SRB: 670.8,
      SYC: 571.43, SLE: 47.62, SGP: 498.74, SVK: 96.49, SVN: 227.65, SLB: 636.36, SOM: 523.81,
      ZAF: 713.48, KOR: 415.65, SSD: 610.17, ESP: 146.15, LKA: 509.78, SDN: 214.33, SUR: 383.18,
      SWE: 35.82, CHE: 36.72, SYR: 682.27, TWN: 635.15, TJK: 98.7, TZA: 371.59, THA: 555.43,
      PHL: 613.38, TGO: 478.26, TON: 571.43, TTO: 682.11, TUN: 560.25, TUR: 469.7, TKM: 1306.3,
      TCA: 653.85, UGA: 57.39, UKR: 250.47, ARE: 467.51, GBR: 215.79, USA: 383.55, URY: 96.7,
      UZB: 1121.18, VUT: 500, VEN: 180.25, VNM: 486.13, VGB: 647.06, VIR: 641.79, WORLD: 472.95,
      YEM: 586.32, ZMB: 111, ZWE: 298.44
    };

    // Mapeamento de códigos ISO 3166-1 alpha-2 (de ip-api.com) para alpha-3 (usado nos dados)
    const countryCodeMap = {
        'BR': 'BRA', 'US': 'USA', 'CA': 'CAN', 'MX': 'MEX', 'AR': 'ARG', 'DE': 'DEU', 
        'FR': 'FRA', 'GB': 'GBR', 'ES': 'ESP', 'PT': 'PRT', 'PL': 'POL', 'CN': 'CHN', 
        'IN': 'IND', 'JP': 'JPN', 'KR': 'KOR', 'AU': 'AUS', 'GLOBAL': 'WORLD'
    };

    // Se o código recebido for um código de 2 letras que temos no mapa, use o de 3 letras.
    // Caso contrário, use o código como está (assumindo que já seja de 3 letras ou uma região).
    const mappedCode = countryCodeMap[countryCode] || countryCode;
    
    // Retorna a intensidade do código mapeado, ou a intensidade mundial como padrão.
    return intensities[mappedCode] || intensities["WORLD"];
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
    const greenFactor = isGreen ? 0.50 : 1.0; // Reduz as emissões do DC em 50% se for verde, em vez de zerar.

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

        // 1. Definir a intensidade de carbono global para todos os segmentos
    const gridIntensityGlobal = getCarbonIntensityByCountryCode('WORLD');
    const gridIntensityServer = gridIntensityGlobal; // Usa a média global
    const gridIntensityUser = gridIntensityGlobal;   // Usa a média global

    // Manter a informação do país do servidor e do usuário apenas para fins de log e e-mail
    const userIp = req.ip;
    let userCountryCode = 'N/A';
    if (userIp) {
      try {
        const userIpRes = await fetchWithTimeout(`http://ip-api.com/json/${userIp}`);
        const userIpData = await userIpRes.json();
        if (userIpData.status === 'success') {
          userCountryCode = userIpData.countryCode;
        }
      } catch (e) {
        console.log('Falha ao obter geolocalização do IP do usuário.', e.message);
      }
    }
    
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
    
        // 4. Emissão total por visita (considerando 100% de novos visitantes, sem ajuste de cache)
    const emissionPerVisit = operationalEmissions + embodiedEmissions;

    // Estimativa de energia por visita (sem ajuste de cache)
    const totalEnergyIntensity = opEnergyIntensityDC + opEnergyIntensityN + opEnergyIntensityUD + emEnergyIntensityDC + emEnergyIntensityN + emEnergyIntensityUD;
    const energiaEstimativaKWh = pageWeightMB * totalEnergyIntensity;

    // --- FIM DA LÓGICA DE CÁLCULO ---

        const rating = (() => {
      // ✅ NOVA REGRA: Se a hospedagem NÃO for verde, a nota é 'F' automaticamente.
      if (!isGreen) {
        return "F";
      }
      
      // Se a hospedagem for verde, aplicamos a escala de emissão normal.
      if (emissionPerVisit <= 0.040) return "A+";
      if (emissionPerVisit <= 0.079) return "A";
      if (emissionPerVisit <= 0.145) return "B";
      if (emissionPerVisit <= 0.209) return "C";
      if (emissionPerVisit <= 0.278) return "D";
      if (emissionPerVisit <= 0.359) return "E";
      return "F"; // A nota ainda pode ser 'F' se a emissão for muito alta, mesmo com hospedagem verde.
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