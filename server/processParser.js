const WELL_KNOWN_PORTS = {
  22: 'SSH',
  53: 'DNS',
  80: 'HTTP / Nginx',
  443: 'HTTPS / Nginx',
  3000: 'Node.js',
  3001: 'Node.js',
  5432: 'PostgreSQL',
  6379: 'Redis',
  8000: 'App Server',
  8001: 'App Server',
  8003: 'App Server',
  8004: 'App Server',
  11434: 'Ollama',
  27017: 'MongoDB',
};

export function buildPortOwners(pm2Apps, dockerContainers) {
  const owners = new Map();

  for (const app of pm2Apps) {
    if (app.port) {
      owners.set(String(app.port), { process: `pm2: ${app.name}`, source: 'pm2' });
    }
  }

  for (const container of dockerContainers) {
    const portMatches = container.ports?.matchAll(/:(\d+)->/g) || [];
    for (const match of portMatches) {
      owners.set(match[1], { process: `docker: ${container.name}`, source: 'docker' });
    }
    const hostMatches = container.ports?.matchAll(/0\.0\.0\.0:(\d+)/g) || [];
    for (const match of hostMatches) {
      owners.set(match[1], { process: `docker: ${container.name}`, source: 'docker' });
    }
  }

  return owners;
}

export function parseLsofOutput(output) {
  const map = new Map();
  for (const line of output.trim().split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const [name, pid, , , , , , addr] = parts;
    const portMatch = addr.match(/:(\d+)\s/);
    if (portMatch) {
      map.set(portMatch[1], { process: `${name} (${pid})`, source: 'lsof' });
    }
  }
  return map;
}

export function parseSsOutput(output) {
  const map = new Map();
  for (const line of output.trim().split('\n')) {
    if (!line.includes('LISTEN')) continue;

    const portMatch = line.match(/:(\d+)\s/);
    if (!portMatch) continue;
    const port = portMatch[1];

    const ssMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    const netstatMatch = line.match(/LISTEN\s+(\d+)\/(\S+)/);

    if (ssMatch) {
      map.set(port, { process: `${ssMatch[1]} (${ssMatch[2]})`, source: 'ss' });
    } else if (netstatMatch) {
      map.set(port, { process: `${netstatMatch[2]} (${netstatMatch[1]})`, source: 'netstat' });
    }
  }
  return map;
}

export function mergePorts(ssOutput, lsofOutput, pm2Apps, dockerContainers) {
  const owners = buildPortOwners(pm2Apps, dockerContainers);
  const ssMap = parseSsOutput(ssOutput);
  const lsofMap = parseLsofOutput(lsofOutput);

  const allPorts = new Set([...ssMap.keys(), ...lsofMap.keys(), ...owners.keys()]);

  const ports = [...allPorts].map((port) => {
    const owner = owners.get(port);
    const lsof = lsofMap.get(port);
    const ss = ssMap.get(port);
    const known = WELL_KNOWN_PORTS[port];

    let process = owner?.process || lsof?.process || ss?.process || known || 'unknown';
    let source = owner?.source || lsof?.source || ss?.source || (known ? 'known' : 'unknown');

    return {
      type: 'port',
      port,
      process,
      source,
      address: `:${port}`,
    };
  });

  return ports.sort((a, b) => Number(a.port) - Number(b.port));
}
