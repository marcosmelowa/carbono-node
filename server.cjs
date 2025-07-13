// server.cjs

// === MODELO DE CÁLCULO ===
// Versão: v4 (com redução de 86,31% validada por comparação com WCC)
// Última validação: Marcos Melo - 2025-07
// NÃO MODIFICAR COEFICIENTES SEM AVALIAÇÃO TÉCNICA!

require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const { install } = require('@puppeteer/browsers');
const cors = require("cors");
const dns = require("dns").promises;
const nodemailer = require("nodemailer");

// Novas importações para geração de imagem
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

const app = express();

// ✅ MUDANÇA: Aumentando o tempo limite padrão para 90 segundos
async function fetchWithTimeout(url, timeout = 90000) { // 90 segundos de timeout
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        // Se o erro for de Abort, lança uma mensagem mais clara
        if (error.name === 'AbortError') {
            throw new Error(`A requisição para ${url} demorou mais de ${timeout / 1000} segundos.`);
        }
        throw error;
    }
}

// === INCLUSÃO DE CORS RESTRITO AO DOMÍNIO DO SITE ===
app.use(cors({
  origin: 'https://aplicacoes.tec.br',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.post("/calculate", async (req, res) => {
  const { url, nome, celular, email } = req.body;

  let browser; // Definir o browser fora do try para que possamos fechá-lo no finally

  try {
    console.log('Verificando e instalando o navegador Chromium...');
    const installedBrowser = await install({
        browser: 'chrome',
        buildId: '126.0.6478.126', // Uma versão estável conhecida
        cacheDir: '.cache/puppeteer'
    });
    console.log('Navegador pronto para uso em:', installedBrowser.executablePath);
    
    const hostname = new URL(url).hostname;

    console.log(`Verificando Green Web para: ${hostname}`);
    const greenCheckRes = await fetchWithTimeout(`https://api.thegreenwebfoundation.org/greencheck/${hostname}`);
    const greenCheckData = await greenCheckRes.json();
    console.log('Verificação Green Web concluída.');

    const isGreen = greenCheckData.green || false;
    const hostedBy = greenCheckData.hostedby || "Desconhecido";
    const hostedByURL = greenCheckData.hostedbywebsite || "";
    const greenFactor = isGreen ? 0.20 : 1.0;

    let ipAddress = "";
    try {
      const addresses = await dns.lookup(hostname);
      ipAddress = addresses.address;
    } catch (e){
      console.log('Não foi possível obter o endereço de IP via DNS.');
    }

    let cidadeServidor = "Indefinido";
    let paisServidor = "Indefinido";
    let orgServidor = "Desconhecido";

    if (ipAddress) {
      try {
        console.log(`Verificando IP-API para: ${ipAddress}`);
        const ipApiRes = await fetchWithTimeout(`http://ip-api.com/json/${ipAddress}`);
        const ipData = await ipApiRes.json();
        cidadeServidor = ipData.city || "Indefinido";
        paisServidor = ipData.countryCode || "Indefinido";
        orgServidor = ipData.org || "Desconhecido";
        console.log('Verificação IP-API concluída.');
      } catch (e){
        console.log('Falha ao consultar a API de IP:', e.message);
      }
    }

    console.log('Iniciando Puppeteer...');
    browser = await puppeteer.launch({
      executablePath: installedBrowser.executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    const page = await browser.newPage();
    console.log(`Navegando para: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    console.log('Página carregada. Coletando recursos...');

    const resources = await page.evaluate(() => {
      return performance.getEntriesByType("resource").map(r => ({
        name: r.name,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
        decodedBodySize: r.decodedBodySize,
        initiatorType: r.initiatorType
      }));
    });
    console.log(`Recursos coletados: ${resources.length} itens. Iniciando cálculos...`);

    const pageWeightBytes = resources.reduce((sum, r) => sum + (r.decodedBodySize || 0), 0);
    const pageWeightMB = pageWeightBytes / (1024 * 1024);

    const externalScripts = resources.filter(r => r.initiatorType === 'script' && !r.name.includes(hostname));
    const heavyDomains = resources.filter(r => /googleapis|gstatic|doubleclick|youtube|vimeo/.test(r.name));

    const penaltyExternal = externalScripts.length * 0.0006845;
    const penaltyCDN = heavyDomains.length * 0.001369;
    const totalPenalty = penaltyExternal + penaltyCDN;

    const mediaConexao = 0.240544;
    const energiaRenderKWh = pageWeightMB * 0.000004107;

    const gridIntensity = 494;

    const eiDC = 0.007530 / 1024;
    const eiN = 0.008079 / 1024;
    const eiUD = 0.010953 / 1024;

    const eiEMDC = 0.001643 / 1024;
    const eiEMN = 0.001779 / 1024;
    const eiEMUD = 0.011067 / 1024;

    const opDC = pageWeightMB * eiDC * gridIntensity * greenFactor;
    const opN = pageWeightMB * eiN * gridIntensity;
    const opUD = pageWeightMB * eiUD * gridIntensity;

    const emDC = pageWeightMB * eiEMDC * gridIntensity;
    const emN = pageWeightMB * eiEMN * gridIntensity;
    const emUD = pageWeightMB * eiEMUD * gridIntensity;

    const emissionPerVisit =
      (opDC + opN + opUD + emDC + emN + emUD) +
      (mediaConexao * pageWeightMB) +
      (energiaRenderKWh * gridIntensity) +
      totalPenalty;

    const rating = (() => {
      if (emissionPerVisit < 0.095) return "A+";
      else if (emissionPerVisit < 0.186) return "A";
      else if (emissionPerVisit < 0.341) return "B";
      else if (emissionPerVisit < 0.493) return "C";
      else if (emissionPerVisit < 0.656) return "D";
      else if (emissionPerVisit < 0.846) return "E";
      return "F";
    })();

    const energiaEstimativaKWh = pageWeightMB * (eiDC + eiN + eiUD);
    
    console.log('Cálculos finalizados. Preparando para enviar e-mail...');
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.hostinger.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
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
          <p><strong>🌿 Emissão estimada:</strong> ${emissionPerVisit.toFixed(3)} g CO₂/visita</p>
          <p><strong>⚡ Energia estimada:</strong> ${energiaEstimativaKWh.toFixed(5)} kWh</p>
          <p><strong>📊 Classificação:</strong> ${rating}</p>
          <p><strong>🌲 Equivalente a:</strong> ${(emissionPerVisit / 21000).toFixed(3)} árvores/ano</p>
          <p><strong>🚗 Ou:</strong> ${(emissionPerVisit / 404).toFixed(2)} km dirigidos</p>
          <hr>
          <p><strong>💾 Peso da página:</strong> ${pageWeightMB.toFixed(2)} MB</p>
          <p><strong>📎 Scripts externos:</strong> ${externalScripts.length}</p>
          <p><strong>🎯 Domínios pesados:</strong> ${heavyDomains.length}</p>
          <p><strong>🧮 Penalidade total:</strong> ${totalPenalty.toFixed(3)} g CO₂</p>
          <p><strong>🛰️ Localização do servidor:</strong> ${cidadeServidor}, ${paisServidor}</p>
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
      km: (emissionPerVisit / 404).toFixed(2),
      arvores: (emissionPerVisit / 21000).toFixed(3),
      green: isGreen,
      hostedby: hostedBy,
      hostedbywebsite: hostedByURL,
      servidor: {
        cidade: cidadeServidor,
        pais: paisServidor,
        org: orgServidor
      },
      externalScripts: externalScripts.length,
      heavyDomains: heavyDomains.length,
      totalPenalty: totalPenalty.toFixed(3),
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

// NOVA ROTA PARA GERAR O SELO
app.get('/generate-badge', async (req, res) => {
    try {
        const { domain, comparison } = req.query;

        // Validação simples dos parâmetros
        if (!domain || !comparison) {
            return res.status(400).send('Parâmetros "domain" e "comparison" são obrigatórios.');
        }

        // Caminho para a pasta de assets
        const assetsPath = path.join(__dirname, 'assets');
        
        // Registrar a fonte 'Anta'
        // NOTA: Precisaremos adicionar o arquivo da fonte 'Anta-Regular.ttf' na pasta 'assets'
        registerFont(path.join(assetsPath, 'Anta-Regular.ttf'), { family: 'Anta' });
        
        // Carregar o template do selo
        const templatePath = path.join(assetsPath, 'badge-template.png');
        const image = await loadImage(templatePath);

        // Criar o canvas com as dimensões do template
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // 1. Desenhar a imagem do template como fundo
        ctx.drawImage(image, 0, 0, image.width, image.height);

        // 2. Configurar e desenhar o texto do domínio
        ctx.fillStyle = '#E0E0E0'; // Cor cinza claro para o domínio
        ctx.font = '10px "Anta"';
        ctx.textAlign = 'left';
        ctx.fillText(domain, 12, 43); // Posição (x, y) ajustada para o seu layout

        // 3. Configurar e desenhar o texto de comparação
        ctx.fillStyle = '#B0B0B0'; // Cor cinza um pouco mais escura
        ctx.font = '7.5px "Anta"';
        ctx.fillText(comparison, 12, 58); // Posição (x, y) ajustada

        // Finalizar e enviar a imagem
        res.setHeader('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error('Erro ao gerar o selo:', error);
        res.status(500).send('Erro ao gerar a imagem do selo.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));