const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_CONFIG = {
  adminPin: '1234',
  companyName: 'Centro de Soporte & Reportes',
  categories: ['Soporte Técnico', 'Incidencia', 'Solicitud de Servicio', 'Facturación / Pagos', 'Mantenimiento', 'Otro'],
  smtp: {
    host: 'smtp.gmail.com',
    port: 465,
    user: 'jwexecutiveoffice@gmail.com',
    fromName: 'Departamento de Sistemas',
    fromEmail: 'jwexecutiveoffice@gmail.com',
    alertEmails: 'coordinadora.it@buenaventuraresort.com, Sistemas@buenaventuraresort.com'
  },
  publicBaseUrl: 'https://agenda-tickets.onrender.com'
};

// PostgreSQL Setup (if DATABASE_URL is provided, e.g. on Render)
let pgPool = null;
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  console.log('🐘 Conectando a Base de Datos PostgreSQL permanente...');
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  // Initialize PostgreSQL tables
  (async () => {
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS config (
          key VARCHAR(50) PRIMARY KEY,
          value JSONB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tickets (
          id VARCHAR(50) PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category VARCHAR(100),
          priority VARCHAR(20),
          status VARCHAR(20),
          requester JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          closed_at TIMESTAMPTZ,
          history JSONB NOT NULL,
          internal_notes JSONB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      `);
      console.log('✅ Tablas de PostgreSQL verificadas y listas.');

      // Sincronizar y cargar configuración persistente desde PostgreSQL
      const cfgRow = await pgPool.query("SELECT value FROM config WHERE key = 'app_config'");
      if (cfgRow.rows.length > 0 && cfgRow.rows[0].value) {
        memoryConfig = { ...DEFAULT_CONFIG, ...cfgRow.rows[0].value };
        writeJsonFile(CONFIG_FILE, memoryConfig);
        console.log('⚙️ Configuración cargada desde PostgreSQL.');
      } else {
        const initialCfg = getConfig();
        await pgPool.query(
          "INSERT INTO config (key, value) VALUES ('app_config', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
          [JSON.stringify(initialCfg)]
        );
      }

      // Check if DB is empty and migrate from JSON
      const res = await pgPool.query('SELECT COUNT(*) FROM tickets');
      if (parseInt(res.rows[0].count) === 0 && fs.existsSync(TICKETS_FILE)) {
        const localTickets = readJsonFile(TICKETS_FILE, []);
        console.log(`📦 Migrando ${localTickets.length} tickets locales hacia PostgreSQL...`);
        for (const t of localTickets) {
          await pgPool.query(`
            INSERT INTO tickets (id, title, description, category, priority, status, requester, created_at, updated_at, closed_at, history, internal_notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO NOTHING
          `, [t.id, t.title, t.description, t.category, t.priority, t.status, JSON.stringify(t.requester), t.createdAt, t.updatedAt, t.closedAt, JSON.stringify(t.history), JSON.stringify(t.internalNotes || [])]);
        }
        console.log('🎉 Migración completada exitosamente.');
      }
    } catch (err) {
      console.error('Error inicializando PostgreSQL:', err.message);
    }
  })();
}

let memoryConfig = null;

function readJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  try {
    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

function getConfig() {
  if (!memoryConfig) {
    memoryConfig = readJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
  }
  return memoryConfig;
}

function updateConfig(newValues) {
  const current = getConfig();
  memoryConfig = { ...current, ...newValues };
  writeJsonFile(CONFIG_FILE, memoryConfig);
  if (pgPool) {
    pgPool.query(
      "INSERT INTO config (key, value) VALUES ('app_config', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify(memoryConfig)]
    ).catch(err => console.error('Error sincronizando config con PostgreSQL:', err.message));
  }
  return memoryConfig;
}

function getAllTicketsLocal() {
  return readJsonFile(TICKETS_FILE, []);
}

function saveTicketsLocal(tickets) {
  writeJsonFile(TICKETS_FILE, tickets);
}

function generateTicketId() {
  const year = new Date().getFullYear();
  const randomChars = crypto.randomBytes(2).toString('hex').toUpperCase();
  const timestampSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TCK-${year}-${randomChars}${timestampSuffix}`;
}

function getLocalDateString(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const db = {
  getConfig,
  updateConfig,

  verifyAdminPin(pin) {
    const config = getConfig();
    return String(pin).trim() === String(config.adminPin).trim();
  },

  updateAdminPin(currentPin, newPin) {
    if (!this.verifyAdminPin(currentPin)) {
      throw new Error('El PIN actual es incorrecto.');
    }
    if (!newPin || String(newPin).trim().length < 4) {
      throw new Error('El nuevo PIN debe tener al menos 4 caracteres.');
    }
    updateConfig({ adminPin: String(newPin).trim() });
    return true;
  },

  async createTicket({ title, description, category, priority, requester }) {
    if (!title || !description || !requester?.name) {
      throw new Error('Título, descripción y nombre del solicitante son obligatorios.');
    }

    const id = generateTicketId();
    const now = new Date().toISOString();

    let rawPhone = (requester.phone || '').trim();
    let cleanDigits = rawPhone.replace(/\D/g, '');
    let normalizedPhone = rawPhone;
    if (cleanDigits.length === 8) {
      normalizedPhone = `+507 ${cleanDigits}`;
    } else if (cleanDigits.startsWith('507') && cleanDigits.length === 11) {
      normalizedPhone = `+507 ${cleanDigits.slice(3)}`;
    }

    const newTicket = {
      id,
      title: title.trim(),
      description: description.trim(),
      category: category || 'Incidencia',
      priority: priority || 'media',
      status: 'pendiente',
      requester: {
        name: requester.name.trim(),
        email: (requester.email || '').trim(),
        phone: normalizedPhone
      },
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      history: [
        {
          id: crypto.randomUUID(),
          type: 'created',
          author: 'solicitante',
          authorName: requester.name.trim(),
          message: 'Ticket creado exitosamente y registrado en la agenda del día.',
          timestamp: now
        }
      ],
      internalNotes: []
    };

    if (pgPool) {
      await pgPool.query(`
        INSERT INTO tickets (id, title, description, category, priority, status, requester, created_at, updated_at, closed_at, history, internal_notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [newTicket.id, newTicket.title, newTicket.description, newTicket.category, newTicket.priority, newTicket.status, JSON.stringify(newTicket.requester), newTicket.createdAt, newTicket.updatedAt, newTicket.closedAt, JSON.stringify(newTicket.history), JSON.stringify(newTicket.internalNotes)]);
    } else {
      const tickets = getAllTicketsLocal();
      tickets.unshift(newTicket);
      saveTicketsLocal(tickets);
    }

    return newTicket;
  },

  async getTicketById(id) {
    const normalized = String(id).trim().toUpperCase();

    if (pgPool) {
      const res = await pgPool.query('SELECT * FROM tickets WHERE UPPER(id) = $1', [normalized]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        priority: r.priority,
        status: r.status,
        requester: r.requester,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        closedAt: r.closed_at ? r.closed_at.toISOString() : null,
        history: r.history,
        internalNotes: r.internal_notes || []
      };
    } else {
      const tickets = getAllTicketsLocal();
      return tickets.find(t => t.id.toUpperCase() === normalized) || null;
    }
  },

  async getTickets({ date, status, search, month } = {}) {
    if (pgPool) {
      let query = 'SELECT * FROM tickets WHERE 1=1';
      const params = [];

      if (date) {
        params.push(`${date}%`);
        query += ` AND created_at::text LIKE $${params.length}`;
      } else if (month) {
        params.push(`${month}%`);
        query += ` AND created_at::text LIKE $${params.length}`;
      }

      if (status && status !== 'todos') {
        params.push(status.toLowerCase());
        query += ` AND LOWER(status) = $${params.length}`;
      }

      query += ' ORDER BY created_at DESC';
      const res = await pgPool.query(query, params);

      let tickets = res.rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        priority: r.priority,
        status: r.status,
        requester: r.requester,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        closedAt: r.closed_at ? r.closed_at.toISOString() : null,
        history: r.history,
        internalNotes: r.internal_notes || []
      }));

      if (search) {
        const q = search.trim().toLowerCase();
        tickets = tickets.filter(t =>
          t.id.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.requester.name && t.requester.name.toLowerCase().includes(q)) ||
          (t.requester.email && t.requester.email.toLowerCase().includes(q)) ||
          (t.requester.phone && t.requester.phone.includes(q))
        );
      }

      return tickets;
    } else {
      let tickets = getAllTicketsLocal();

      if (date) {
        tickets = tickets.filter(t => getLocalDateString(t.createdAt) === date);
      } else if (month) {
        tickets = tickets.filter(t => getLocalDateString(t.createdAt).startsWith(month));
      }

      if (status && status !== 'todos') {
        tickets = tickets.filter(t => t.status.toLowerCase() === status.toLowerCase());
      }

      if (search) {
        const q = search.trim().toLowerCase();
        tickets = tickets.filter(t =>
          t.id.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.requester.name && t.requester.name.toLowerCase().includes(q)) ||
          (t.requester.email && t.requester.email.toLowerCase().includes(q)) ||
          (t.requester.phone && t.requester.phone.includes(q))
        );
      }

      return tickets;
    }
  },

  async updateTicketStatus(id, newStatus, comment = '', updatedByName = 'Equipo de Sistemas') {
    const allowed = ['pendiente', 'en_proceso', 'resuelto', 'cerrado'];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Estado no válido: ${newStatus}`);
    }

    const ticket = await this.getTicketById(id);
    if (!ticket) throw new Error('Ticket no encontrado');

    const oldStatus = ticket.status;
    const now = new Date().toISOString();

    ticket.status = newStatus;
    ticket.updatedAt = now;
    if (newStatus === 'cerrado' && !ticket.closedAt) {
      ticket.closedAt = now;
    } else if (newStatus !== 'cerrado') {
      ticket.closedAt = null;
    }

    ticket.history.push({
      id: crypto.randomUUID(),
      type: 'status_change',
      author: 'admin',
      authorName: updatedByName,
      oldStatus,
      newStatus,
      message: comment || `Estado actualizado a "${newStatus.replace('_', ' ').toUpperCase()}".`,
      timestamp: now
    });

    if (pgPool) {
      await pgPool.query(`
        UPDATE tickets
        SET status = $1, updated_at = $2, closed_at = $3, history = $4
        WHERE UPPER(id) = $5
      `, [ticket.status, ticket.updatedAt, ticket.closedAt, JSON.stringify(ticket.history), String(id).toUpperCase()]);
    } else {
      const tickets = getAllTicketsLocal();
      const idx = tickets.findIndex(t => t.id.toUpperCase() === String(id).toUpperCase());
      if (idx !== -1) {
        tickets[idx] = ticket;
        saveTicketsLocal(tickets);
      }
    }

    return ticket;
  },

  async addComment(id, { author, authorName, message }) {
    if (!message || !message.trim()) {
      throw new Error('El mensaje no puede estar vacío.');
    }

    const ticket = await this.getTicketById(id);
    if (!ticket) throw new Error('Ticket no encontrado');

    const now = new Date().toISOString();
    const newComment = {
      id: crypto.randomUUID(),
      type: 'comment',
      author: author || 'solicitante',
      authorName: authorName || (author === 'admin' ? 'Departamento de Sistemas' : ticket.requester.name),
      message: message.trim(),
      timestamp: now
    };

    ticket.history.push(newComment);
    ticket.updatedAt = now;

    if (pgPool) {
      await pgPool.query(`
        UPDATE tickets
        SET updated_at = $1, history = $2
        WHERE UPPER(id) = $3
      `, [ticket.updatedAt, JSON.stringify(ticket.history), String(id).toUpperCase()]);
    } else {
      const tickets = getAllTicketsLocal();
      const idx = tickets.findIndex(t => t.id.toUpperCase() === String(id).toUpperCase());
      if (idx !== -1) {
        tickets[idx] = ticket;
        saveTicketsLocal(tickets);
      }
    }

    return ticket;
  },

  async addInternalNote(id, noteText, authorName = 'Administrador') {
    if (!noteText || !noteText.trim()) {
      throw new Error('La nota interna no puede estar vacía.');
    }

    const ticket = await this.getTicketById(id);
    if (!ticket) throw new Error('Ticket no encontrado');

    const now = new Date().toISOString();
    ticket.internalNotes.push({
      id: crypto.randomUUID(),
      author: authorName,
      message: noteText.trim(),
      timestamp: now
    });
    ticket.updatedAt = now;

    if (pgPool) {
      await pgPool.query(`
        UPDATE tickets
        SET updated_at = $1, internal_notes = $2
        WHERE UPPER(id) = $3
      `, [ticket.updatedAt, JSON.stringify(ticket.internalNotes), String(id).toUpperCase()]);
    } else {
      const tickets = getAllTicketsLocal();
      const idx = tickets.findIndex(t => t.id.toUpperCase() === String(id).toUpperCase());
      if (idx !== -1) {
        tickets[idx] = ticket;
        saveTicketsLocal(tickets);
      }
    }

    return ticket;
  },

  async getDailyStats(dateString) {
    const targetDate = dateString || getLocalDateString();
    const tickets = await this.getTickets();

    const ticketsForDate = tickets.filter(t => getLocalDateString(t.createdAt) === targetDate);

    return {
      date: targetDate,
      totalToday: ticketsForDate.length,
      pendiente: ticketsForDate.filter(t => t.status === 'pendiente').length,
      en_proceso: ticketsForDate.filter(t => t.status === 'en_proceso').length,
      resuelto: ticketsForDate.filter(t => t.status === 'resuelto').length,
      cerrado: ticketsForDate.filter(t => t.status === 'cerrado').length,
      allTimeTotal: tickets.length,
      allTimeOpen: tickets.filter(t => t.status !== 'cerrado').length
    };
  },

  // Monthly Analytics & Duplicate Detection
  async getMonthlyReport(yearMonthString) {
    // yearMonthString: e.g. "2026-09"
    const ym = yearMonthString || getLocalDateString().slice(0, 7);
    const tickets = await this.getTickets({ month: ym });

    // Grouping by requester
    const byRequester = {};
    // Grouping by category
    const byCategory = {};
    // Grouping by normalized title words to detect repeated issues
    const normalizedIssues = {};

    tickets.forEach(t => {
      // By requester
      const reqKey = (t.requester.name || 'Desconocido').trim();
      byRequester[reqKey] = (byRequester[reqKey] || 0) + 1;

      // By category
      const catKey = t.category || 'Otros';
      byCategory[catKey] = (byCategory[catKey] || 0) + 1;

      // Duplicate detection: clean and normalize words (remove stop words)
      const cleanTitle = t.title.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!normalizedIssues[cleanTitle]) {
        normalizedIssues[cleanTitle] = {
          issue: t.title,
          category: t.category,
          count: 0,
          ticketIds: []
        };
      }
      normalizedIssues[cleanTitle].count += 1;
      normalizedIssues[cleanTitle].ticketIds.push(t.id);
    });

    // Filter repeated issues (count >= 2)
    const repeated = Object.values(normalizedIssues)
      .filter(item => item.count >= 2)
      .sort((a, b) => b.count - a.count);

    return {
      month: ym,
      totalMonth: tickets.length,
      resueltos: tickets.filter(t => t.status === 'resuelto' || t.status === 'cerrado').length,
      pendientes: tickets.filter(t => t.status === 'pendiente' || t.status === 'en_proceso').length,
      byCategory,
      byRequester: Object.entries(byRequester).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      repeatedIssues: repeated,
      tickets
    };
  }
};

module.exports = db;
