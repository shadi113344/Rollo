function createBasicAuthMiddleware() {
  const user = process.env.ROLLO_BASIC_USER || "";
  const pass = process.env.ROLLO_BASIC_PASS || "";
  if (!user || !pass) {
    return (_req, _res, next) => next();
  }

  const expected = Buffer.from(`${user}:${pass}`).toString("base64");

  return (req, res, next) => {
    const header = req.headers.authorization || "";
    if (header === `Basic ${expected}`) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Rollo"');
    res.status(401).send("Authentication required");
  };
}

module.exports = { createBasicAuthMiddleware };
