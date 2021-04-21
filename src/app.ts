#!/usr/bin/env node

console.log(Date(), "App loading...");
import http from "http";
import https from "https";

const Server = http.createServer((req, res) => {
  if (req.url && req.url?.indexOf("/update")<0) {
    res.writeHead(404);
    return res.end();
  }
  console.log("**** ", new Date(), ` ${req.url} ${req.socket.remoteAddress}`);

  let statusCode = 500;
  const IP = "x-real-ip";

  /** Get the IP address */
  let realIP = "";
  if (Array.isArray(req.headers[IP]))
    realIP = req.headers[IP]?.[0] ?? "";
  else
    realIP = req.headers[IP] as string;
  console.log(`IP is ${realIP}`);

  if (!realIP) {
    console.error(Date(), `x-real-IP missing`);
    console.log( `x-real-IP missing`);
    statusCode = 402;
  } else {

    /** Get credentials */
    let credentials = ["", ""];
    if (!req.headers["authorization"]) {
      console.error(Date(), `authorization missing ${req.headers[IP]}`);
      statusCode = 401;
    } else {
      console.log(`authorization:${req.headers.authorization}`)
      const parts = req.headers["authorization"].split("Basic ");
      if (parts.length != 2) {
        console.error(Date(), ` authorization is not Basic`);
        statusCode = 403;
      } else {
        const buff = Buffer.from(parts[1], "base64");
        const c = buff.toString("ascii");
        credentials = c.split(":");
        if (credentials.length != 2) {
          console.error(Date(), ` Basic credentials format error: ${req.headers.authorization}=${c}`);
          statusCode = 406;
        } else {
          console.log(`Credentials: ${credentials}`);
          const updateUrl = `https://entrydns.net/records/modify/${credentials[1]}?ip=${realIP}`;
          https.get(updateUrl, res => {
            console.log(`${updateUrl} result is: ${res.statusCode}`);
            res.on("data", d => { console.log(d.toString("ascii")); });
          }).on("error", e => {
            console.log(`Error from entrydns:`, e);
          })
        }
      }
    }
  }

  console.log(req.headers);
  res.writeHead(statusCode, {"content-type": "text/plain"});
  res.write(`${statusCode} ${req.url} ${req.socket.remoteAddress}\n`);
  Object.keys(req.headers).forEach(k => {
    res.write(`${k} : ${req.headers[k]}\n`);
  });
  res.end();
  
}).listen(8084);


