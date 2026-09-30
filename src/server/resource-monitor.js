const os = require('os');
const fs = require('fs');
const EventEmitter = require('events');

const MiB = 1024 * 1024;
const numberEnv = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

function numericFile(file) {
    try {
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (!raw || raw === 'max') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
}

// Docker can place a process below the cgroup mount root. Reading only
// /sys/fs/cgroup/memory.max misses that case after `docker update --memory`.
function cgroupMemory() {
    try {
        const lines = fs.readFileSync('/proc/self/cgroup', 'utf8').trim().split(/\r?\n/);
        const v2 = lines.find((line) => line.startsWith('0::'));
        const memoryLine = lines.find((line) => line.split(':')[1]?.split(',').includes('memory'));
        const root = v2 ? '/sys/fs/cgroup' : '/sys/fs/cgroup/memory';
        const relative = v2 ? v2.split(':').slice(2).join(':') : memoryLine?.split(':').slice(2).join(':');
        if (!relative) return null;
        let dir = require('path').resolve(root, `.${relative}`);
        if (dir !== root && !dir.startsWith(`${root}/`)) return null;
        let limit = null;
        let usage = null;
        const limitName = v2 ? 'memory.max' : 'memory.limit_in_bytes';
        const usageName = v2 ? 'memory.current' : 'memory.usage_in_bytes';
        while (dir === root || dir.startsWith(`${root}/`)) {
            const candidate = numericFile(require('path').join(dir, limitName));
            if (candidate && (!limit || candidate < limit)) limit = candidate;
            if (dir === root) break;
            dir = require('path').dirname(dir);
        }
        usage = numericFile(require('path').join(require('path').resolve(root, `.${relative}`), usageName));
        return limit ? { limitBytes: limit, usedBytes: usage } : null;
    } catch { return null; }
}

function snapshot() {
    const hostTotal = os.totalmem();
    const hostFree = os.freemem();
    const cgroup = cgroupMemory();
    const totalBytes = cgroup?.limitBytes && cgroup.limitBytes < hostTotal ? cgroup.limitBytes : hostTotal;
    const cgroupFree = cgroup?.limitBytes && cgroup.usedBytes != null ? Math.max(0, cgroup.limitBytes - cgroup.usedBytes) : null;
    const availableBytes = cgroupFree == null ? hostFree : Math.min(hostFree, cgroupFree);
    const cpus = Math.max(1, os.cpus()?.length || 1);
    const load = os.loadavg?.()[0] || 0;
    const cpuLoad = load > 0 ? load / cpus : 0;
    return {
        timestamp: Date.now(), totalMb: Math.round(totalBytes / MiB), availableMb: Math.round(availableBytes / MiB),
        cgroupLimitMb: cgroup?.limitBytes ? Math.round(cgroup.limitBytes / MiB) : null,
        cgroupUsedMb: cgroup?.usedBytes != null ? Math.round(cgroup.usedBytes / MiB) : null,
        cpuCount: cpus, cpuLoad: Number(cpuLoad.toFixed(2))
    };
}

function deriveConcurrency(data) {
    const forced = Number(process.env.MAX_CONCURRENT_EXECUTIONS);
    if (Number.isInteger(forced) && forced > 0) return forced;
    if (data.totalMb <= 2560) return 1;
    if (data.totalMb < 6144) return Math.min(2, data.cpuCount);
    const reserve = Math.max(numberEnv('RESOURCE_MEMORY_RESERVE_MB', 512), Math.ceil(data.totalMb * 0.15));
    return Math.max(1, Math.min(4, Math.max(1, data.cpuCount - 1), Math.floor((data.totalMb - reserve) / 768)));
}

class ResourceMonitor extends EventEmitter {
    constructor() {
        super();
        this.intervalMs = numberEnv('RESOURCE_PROBE_INTERVAL_MS', 30000);
        this.cpuThreshold = numberEnv('RESOURCE_CPU_THRESHOLD', 0.9);
        this.current = snapshot();
        this.timer = null;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.probe(), this.intervalMs);
        this.timer.unref?.();
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

    probe() {
        const previous = this.current;
        const next = snapshot();
        this.current = next;
        const changed = !previous || Math.abs(previous.totalMb - next.totalMb) >= 128
            || Math.abs(previous.availableMb - next.availableMb) >= 128
            || previous.cpuLoad !== next.cpuLoad || previous.cgroupLimitMb !== next.cgroupLimitMb;
        if (changed) this.emit('change', next, previous);
        return next;
    }

    reserveMb(data = this.current) { return Math.max(numberEnv('RESOURCE_MEMORY_RESERVE_MB', 512), Math.ceil(data.totalMb * 0.15)); }
    isPressured(data = this.current) {
        return data.availableMb < this.reserveMb(data) || data.cpuLoad >= this.cpuThreshold;
    }
    status() {
        const data = this.current || this.probe();
        return { ...data, reserveMb: this.reserveMb(data), maxConcurrent: deriveConcurrency(data), pressure: this.isPressured(data) ? 'Busy' : 'Normal' };
    }
}

const resourceMonitor = new ResourceMonitor();
module.exports = { ResourceMonitor, resourceMonitor, snapshot, deriveConcurrency, cgroupMemory };
