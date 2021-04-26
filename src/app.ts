#!/usr/bin/env node

/*****************************************
 * 
 * Imitates a Dyn DNS server. Some routers, eg D-Link, allow the specification of a server that handles the same protocol as Dyn DNS.
 * The router calls the specified server when it detects an IP address change.
 * 
 * This server handles such requests and updates an entrydns.org dyanamic host with the IP address of the requester. Modify the 
 * update part as necessary to suit the dynamic DNS server you are using.
 * 
 * API: GET /update?hostname=optional with Basic authentication credentials containing the EntryDNS Token in the Password field.
 * 
 * The requester's IP address is the address to be usess for updating the domain. This version assumes the server is behind a proxy and the
 * proxy passes the real IP address in the header `x-real-ip`. Modify accordingly (eg to req.socket.remoteAddress) to suit your need.
 * 
 * If hostname parameter is present, a ping to it is executed to see if the IP address is same as the caller. If no, no further action is taken.
 * 
 * After data is validated, server then GET https://entrydns.org/records/modify/Token?ip=<IPv4 address> (See https://entrydns.net/help)
 * 
 ****************************************/

console.log(Date(), "App loading...");
import http from "http";
import https from "https";
import dns from "dns";
import querystring from "querystring";

const resolveDNS = (host:string) => {
  return new Promise((resolve: (addr: string) => void, reject) => {
    dns.lookup(host, 4, (err, addr) => {
      if (err)
        reject(err);
      else
        resolve(addr);
    })
  })
} 

const updateEntryDNS = (token:string, ip:string) => {
  const updateUrl = `https://entrydns.net/records/modify/${token}?ip=${ip}`;
  return new Promise((resolve: (statusCode:number) => void, reject) => {
    https.get(updateUrl, res => {
      console.log(`${updateUrl} result is: ${res.statusCode}`);
      res.on("data", d => { console.log(`Response from EntryDNS: ${d.toString("ascii")}`); });
      res.on("end", () => {resolve(res.statusCode as number);});
    }).on("error", e => {
      console.log(`Error from entrydns:`, e);
    })
})
}


/********* Main Application Loop *************/
const Server = http.createServer(async (req, res) => {
  if (req.url && req.url?.indexOf("/update")<0) {
    res.writeHead(404);
    return res.end();
  }
  console.log("**** ", new Date(), ` ${req.url} ${req.socket.remoteAddress}`);

  let statusCode = 500, rc = "911";
  const c_IP = "x-real-ip", c_auth = "authorization";

  /** Get the IP address */
  let realIP: string;
  if (Array.isArray(req.headers[c_IP]))
    realIP = req.headers[c_IP]?.[0] ?? "";
  else
    realIP = req.headers[c_IP] as string;
  console.log(`IP is ${realIP}`);

  if (!realIP) {
    console.error(new Date(), `x-real-ip missing`);
    console.log(`x-real-ip missing`);
    statusCode = 402; rc = "nofqdn";
  } else {
    /* Get the host parameter */
    let host: string | string[] | undefined = undefined;
    const q = req.url?.split("?");
    if (q?.length == 2) {
      host = querystring.decode(q[1]).hostname;
      if (Array.isArray(host)) host = host[0];
    }
    console.log(`host is ${host}`);
    /* See if IP address has changed from current DNS value */
    let currentIP = "";
    if (host) {
      try {
        currentIP = await resolveDNS(host);
        console.log(`${host} is currently ${currentIP}`);
      } catch (err) {
        console.error(new Date(), "resolveDNS error", err);
      }
    }
    if (currentIP == realIP) {
      statusCode = 200; rc = "nochg";
      console.log("IP address has not changed. Not updating.")
    } else {
      /** Get credentials */
      let credentials = ["", ""];
      if (!req.headers[c_auth]) {
        console.error(new Date(), `authorization missing`);
        statusCode = 401; rc = "badauth";
      } else {
        console.log(`authorization:${req.headers.authorization}`)
        const parts = req.headers[c_auth]?.split("Basic ");
        if (parts?.length != 2) {
          console.error(new Date(), ` authorization is not Basic`);
          statusCode = 403; rc = "badauth";
        } else {
          const buff = Buffer.from(parts[1], "base64");
          const c = buff.toString("ascii");
          credentials = c.split(":");
          if (credentials.length != 2) {
            console.error(new Date(), ` Basic credentials format error: ${req.headers.authorization}=${c}`);
            statusCode = 406; rc = "badauth";
          } else {
            console.log(`Credentials: ${credentials}`);
            /*******************************************
             * Updating a dynamic host in entrydns.org
             ******************************************/
            await updateEntryDNS(credentials[1], realIP).then(
              s => {
                statusCode = s; 
                rc = s == 200 ? "good" : "Unexpected return from EntryDNS";
              }
            ).catch(
              err => {
                console.log(`Error return from calling EntryDNS. See error log.`);
                console.error(new Date(), err);
              }
            )
          }
        }
      }
    }
  }

  console.log(req.headers);
  console.log(`${statusCode} ${rc}`)
  res.writeHead(statusCode, {"content-type": "text/plain"});
  res.write(`${rc}\n${statusCode} ${req.url} ${req.socket.remoteAddress}\n`);
  Object.keys(req.headers).forEach(k => {
    res.write(`${k} : ${req.headers[k]}\n`);
  });
  res.end();
  
}).listen(8084);



