// server.js

// === MODELO DE CÁLCULO ===
// Versão: v4 (com redução de 86,31% validada por comparação com WCC)
// Última validação: Marcos Melo - 2025-07
// NÃO MODIFICAR COEFICIENTES SEM AVALIAÇÃO TÉCNICA!

require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const dns = require("dns").promises;
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/calculate", async (req, res) => {
  const { url, nome, celular, email } = req.body;

  try {
    const hostname = new URL(url).hostname;

    // === 1. Verificar hospedagem verde ===
    const greenCheckRes = await fetch(`https://api.thegreenwebfoundation.org/greencheck/${hostname}`);
    const greenCheckData = await greenCheckRes.json();

    const isGreen = greenCheckData.green || false;
    const hostedBy = greenCheckData.hostedby || "Desconhecido";
    const hostedByURL = greenCheckData.hostedbywebsite || "";
    const greenFactor = isGreen ? 0.20 : 1.0;

    // === 2. IP e localização do servidor ===
    let ipAddress = "";
    try {
      const addresses = await dns.lookup(hostname);
      ipAddress = addresses.address;
    } catch {}

    let cidadeServidor = "Indefinido";
    let paisServidor = "Indefinido";
    let orgServidor = "Desconhecido";

    if (ipAddress) {
      try {
        const ipApiRes = await fetch(`http://ip-api.com/json/${ipAddress}`);
        const ipData = await ipApiRes.json();
        cidadeServidor = ipData.city || "Indefinido";
        paisServidor = ipData.countryCode || "Indefinido";
        orgServidor = ipData.org || "Desconhecido";
      } catch {}
    }

    // === 3. Analisar recursos da página ===
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

    const resources = await page.evaluate(() => {
      return performance.getEntriesByType("resource").map(r => ({
        name: r.name,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
        decodedBodySize: r.decodedBodySize,
        initiatorType: r.initiatorType
      }));
    });

    const pageWeightBytes = resources.reduce((sum, r) => sum + (r.decodedBodySize || 0), 0);
    const pageWeightMB = pageWeightBytes / (1024 * 1024);

    // === 4. Penalidades (já com redução de 86,31%) ===
    const externalScripts = resources.filter(r => r.initiatorType === 'script' && !r.name.includes(hostname));
    const heavyDomains = resources.filter(r => /googleapis|gstatic|doubleclick|youtube|vimeo/.test(r.name));

    const penaltyExternal = externalScripts.length * 0.0006845;
    const penaltyCDN = heavyDomains.length * 0.001369;
    const totalPenalty = penaltyExternal + penaltyCDN;

    // === 5. Conexão e energia renderizada (com ajuste 86,31%) ===
    const mediaConexao = 0.240544; // gCO2/MB
    const energiaRenderKWh = pageWeightMB * 0.000004107;

    const gridIntensity = 494;

    // === 6. Emissões operacionais e embutidas com fatores reduzidos ===
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

    // === 7. Classificação (sem alterações) ===
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

    await browser.close();

    // === 8. Enviar e-mail com os dados ===
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
    } catch (mailErr) {
      console.error("Erro ao enviar e-mail:", mailErr.message);
    }

    // === 9. Enviar resposta ao navegador ===
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
    console.error("Erro:", error.message);
    res.status(500).json({ error: "Falha ao calcular emissões ou consultar APIs." });
  }
});

app.listen(3000, () => console.log("✅ Servidor rodando em http://localhost:3000"));
