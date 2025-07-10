document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("carbonForm");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const nome = document.getElementById("nome").value;
    const celular = document.getElementById("celular").value;
    const email = document.getElementById("email").value;
    const url = document.getElementById("url").value;

    // Mostrar barra de progresso
    document.getElementById("result").classList.remove("hidden");
    document.getElementById("carbonResult").classList.add("hidden");
    document.getElementById("rating").classList.add("hidden");

    let progress = 0;
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");

    const interval = setInterval(() => {
      if (progress < 90) {
        progress += Math.floor(Math.random() * 5) + 1;
        progressBar.style.width = `${progress}%`;
        progressText.innerText = `Calculando... ${progress}%`;
      }
    }, 80);

    try {
      const response = await fetch("http://localhost:3000/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, celular, email, url })
      });

      const data = await response.json();

      clearInterval(interval);
      progressBar.style.width = `100%`;
      progressText.innerText = `Cálculo finalizado!`;

      document.getElementById("carbonResult").classList.remove("hidden");
      document.getElementById("rating").classList.remove("hidden");

      document.getElementById("carbonResult").innerHTML = `
        🌿 <strong>${data.emissao.toFixed(3)}g CO₂</strong> por visita<br>
        🌲 ${data.arvores} árvores/ano<br>
        🚗 ${data.km} km dirigidos<br>
        ⚡ ${data.energia.toFixed(5)} kWh consumidos<br>
        🌍 Servidor: ${data.servidor?.cidade || '-'}, ${data.servidor?.pais || '-'}<br>
        💾 Provedor: ${data.servidor?.org || '-'}<br>
      `;

      document.getElementById("rating").innerHTML = `
        <strong>Classificação:</strong> ${data.rating}<br>
        <small>🔬 Metodologia baseada em Sustainable Web Design v4.</small>
      `;
    } catch (err) {
      clearInterval(interval);
      progressText.innerText = `Erro ao calcular emissões.`;
      console.error("Erro:", err);
    }
  });
});
