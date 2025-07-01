document.addEventListener("DOMContentLoaded", () => {
  const apiUrlInput = document.getElementById("apiUrl");
  const responsavelInput = document.getElementById("responsavel");
  const statusText = document.getElementById("status");

  chrome.storage.sync.get(["apiUrl", "responsavel"], (result) => {
    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
    if (result.responsavel) responsavelInput.value = result.responsavel;
  });

  document.getElementById("saveBtn").addEventListener("click", () => {
    const apiUrl = apiUrlInput.value.trim();
    const responsavel = responsavelInput.value.trim();

    chrome.storage.sync.set({ apiUrl, responsavel }, () => {
      statusText.textContent = "Configuração salva com sucesso!";
      setTimeout(() => (statusText.textContent = ""), 2000);
    });
  });
});
