// Servidor local (npm start). Na Vercel, a entrada é api/index.js.
import app, { PUBLIC_URL, PORT, STARTUP_INFO } from "./app.js";

app.listen(PORT, () => {
  console.log(`Frédy Orçamentos rodando em ${PUBLIC_URL}`);
  console.log(STARTUP_INFO);
});
