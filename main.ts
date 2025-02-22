import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

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

const app = new Hono();

app.get('/ping', (c) => {
  const response = ping()
  return c.json(response);
});

app.get('/list', async (c) => {
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

app.post('/add', async (c) => {
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
    return c.json({ success: true, message: "Host added", host: data.host, ip: data.ip });
  } catch (e) {
    throw new HTTPException(401, { message: "Failed to add host", cause: e });
  };
});

app.post('/del', async (c) => {
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
