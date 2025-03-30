import { Context, Next, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

type ReturnMessage = {
  message: string,
};

type HostData = {
  host: string,
  ip: string,
};

type HostName = {
  host: string,
};

async function generateKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [ "sign", "verify"]
  );
}

const SECRET_KEY = await generateKey("secret")

const loadUsers = async () => {
  const usersJson = await Deno.readTextFile("users.json");
  return JSON.parse(usersJson).users;
};

const app = new Hono();

const authMiddleWare = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = await verify(token, SECRET_KEY);
    c.set("user", payload);
    return next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

app.use(logger());

app.post('/login', async (c) => {
  const {username, password} = await c.req.json();
  const users = await loadUsers();

  if (users[username] && users[username] === password) {
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { username, exp: getNumericDate(60 * 60) },
      SECRET_KEY
    );
    return c.json({ token: jwt })
  }

  return c.json({ error: "invalid credentials" }, 401);
});

app.get('/ping', (c) => {
  const response = ping()
  return c.json(response);
});

app.get('/list', authMiddleWare, async (c) => {
  try {
    const data = await listHosts();
    return c.json({ 
      success: true, 
      hosts: data,
    });
  } catch (e) {
    throw new HTTPException(401, { message: "Failed to list hosts", cause: e });
  };
});

app.post('/add', authMiddleWare, async (c) => {
  const data: HostData = await c.req.json();
  if (!data.host) {
    return c.json({ message: "host object is missing" }, 400);
  };
  if (!data.ip) {
    return c.json({ message: "ip object is missing"}, 400);
  };
  if (!validateIp(data.ip)) {
    return c.json({ message: "Invalid ip address", ip: data.ip }, 400);
  };
  if (!await hostNotExist(data.host)) {
    return c.json({ message: "host already exists", host: data.host }, 400);
  }
  try {
    await appendHost(data);
  } catch (e) {
    throw new HTTPException(401, { message: "Failed to add host", cause: e });
  };
  try {
    await reloadDns();
  } catch (e) {
    throw new HTTPException(401, { message: "Host added, but failed to reload dns", cause: e });
  }
  return c.json({ success: true, message: "Host added", host: data.host, ip: data.ip });
});

app.post('/del', authMiddleWare, async (c) => {
  const host: HostName = await c.req.json();
  if (!host.host) {
    return c.json({ message: "host object is missing" }, 400);
  };
  if (await hostNotExist(host.host)) {
    return c.json({ message: "host does not exist", host: host.host }, 400);
  };
  try {
    await deleteHost(host.host);
    return c.json({ success: true, message: "Deleted host", host: host.host });
  } catch (e) {
    throw new HTTPException(401, { message: "Failed to remove host" , cause: e });
  };
});

Deno.serve(app.fetch);

function ping(): ReturnMessage {
  const response = {
    message: "Pong!",
  };

  return response;
};

async function deleteHost(host: string) {
  let hosts: string = ""
  const encoder = new TextEncoder();

  const data = await Deno.readTextFile("./hosts");
  const lines = data.split("\n");

  for (const line of lines) {
    const hostData = line.split(" ");
    if (hostData[1] !== host && line !== "") {
      hosts += line+"\n"
    };
  };

  const newData = encoder.encode(hosts)
  await Deno.writeFile("./hosts", newData);
};

async function appendHost(data: HostData) {
  const line = `${data.ip} ${data.host}\n`;  
  await Deno.writeTextFile("./hosts", line, { append: true });
};

function validateIp(ip: string): boolean {
  const numbers = ip.split(".");
  
  for (const number of numbers) {
    const num = Number(number)
    if (num < 0 || num > 255) {
      return false;
    };
  };

  return true;
};

async function hostNotExist(host: string): Promise<boolean> {
  const data = await Deno.readTextFile("./hosts");
  const lines = data.split("\n");
  for (const line of lines) {
    const hostData = line.split(" ");
    if (hostData[1] === host ) {
      return false;
    };
  };
  
  return true;
}

async function listHosts() {
  const hosts: HostData[] = [];
  const data = await Deno.readTextFile("./hosts");
  const lines = data.split("\n");

  for (const line of lines) {
    if (line !== "") {
      const host = line.split(" ")
      const entry: HostData = {
        host: host[1],
        ip: host[0],
      };

      hosts.push(entry);
    };
  };

  return hosts;
};

async function reloadDns() {
  const cmd = new Deno.Command("systemctl", {
    args: [
      "reload",
      "dnsmasq.service"
    ],
  });

  try {
    await cmd.output();
  } catch (e) {
    console.log(e);
  };
}
