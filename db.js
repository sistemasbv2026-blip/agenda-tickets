const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial config defaults
const DEFAULT_CONFIG = {
  adminPin: '1234',
  companyName: 'Centro de Soporte & Reportes',
  categories: ['Soporte Técnico', 'Incidencia', 'Solicitud de Servicio', 'Facturación / Pagos', 'Mantenimiento', 'Otro']
};

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
  return readJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
}

function updateConfig(newValues) {
  const current = getConfig();
  const updated = { ...current, ...newValues };
  writeJsonFile(CONFIG_FILE, updated);
  return updated;
}

function getAllTickets() {
  return readJsonFile(TICKETS_FILE, []);
}

function saveTickets(tickets) {
  writeJsonFile(TICKETS_FILE, tickets);
}

// Generate unique human-readable ticket ID: e.g. TCK-2026-X8F2
function generateTicketId() {
  const year = new Date().getFullYear();
  const randomChars = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 chars
  const timestampSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TCK-${year}-${randomChars}${timestampSuffix}`;
}

// Format local date string YYYY-MM-DD
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

  createTicket({ title, description, category, priority, requester }) {
    if (!title || !description || !requester?.name) {
      throw new Error('Título, descripción y nombre del solicitante son obligatorios.');
    }

    const tickets = getAllTickets();
    const id = generateTicketId();
    const now = new Date().toISOString();

    const newTicket = {
      id,
      title: title.trim(),
      description: description.trim(),
      category: category || 'Incidencia',
      priority: priority || 'media', // baja, media, alta, urgente
      status: 'pendiente',           // pendiente, en_proceso, resuelto, cerrado
      requester: {
        name: requester.name.trim(),
        email: (requester.email || '').trim(),
        phone: (requester.phone || '').trim()
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

    tickets.unshift(newTicket);
    saveTickets(tickets);
    return newTicket;
  },

  getTicketById(id) {
    const tickets = getAllTickets();
    const normalized = String(id).trim().toUpperCase();
    return tickets.find(t => t.id.toUpperCase() === normalized) || null;
  },

  getTickets({ date, status, search } = {}) {
    let tickets = getAllTickets();

    if (date) {
      // date is YYYY-MM-DD
      tickets = tickets.filter(t => getLocalDateString(t.createdAt) === date);
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
        (t.requester.email && t.requester.email.toLowerCase().includes(q))
      );
    }

    return tickets;
  },

  updateTicketStatus(id, newStatus, comment = '', updatedByName = 'Equipo de Soporte') {
    const allowed = ['pendiente', 'en_proceso', 'resuelto', 'cerrado'];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Estado no válido: ${newStatus}`);
    }

    const tickets = getAllTickets();
    const ticket = tickets.find(t => t.id.toUpperCase() === String(id).toUpperCase());
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

    saveTickets(tickets);
    return ticket;
  },

  addComment(id, { author, authorName, message }) {
    if (!message || !message.trim()) {
      throw new Error('El mensaje no puede estar vacío.');
    }

    const tickets = getAllTickets();
    const ticket = tickets.find(t => t.id.toUpperCase() === String(id).toUpperCase());
    if (!ticket) throw new Error('Ticket no encontrado');

    const now = new Date().toISOString();
    const newComment = {
      id: crypto.randomUUID(),
      type: 'comment',
      author: author || 'solicitante', // 'solicitante' or 'admin'
      authorName: authorName || (author === 'admin' ? 'Soporte / Administrador' : ticket.requester.name),
      message: message.trim(),
      timestamp: now
    };

    ticket.history.push(newComment);
    ticket.updatedAt = now;

    saveTickets(tickets);
    return ticket;
  },

  addInternalNote(id, noteText, authorName = 'Administrador') {
    if (!noteText || !noteText.trim()) {
      throw new Error('La nota interna no puede estar vacía.');
    }

    const tickets = getAllTickets();
    const ticket = tickets.find(t => t.id.toUpperCase() === String(id).toUpperCase());
    if (!ticket) throw new Error('Ticket no encontrado');

    const now = new Date().toISOString();
    ticket.internalNotes.push({
      id: crypto.randomUUID(),
      author: authorName,
      message: noteText.trim(),
      timestamp: now
    });
    ticket.updatedAt = now;

    saveTickets(tickets);
    return ticket;
  },

  getDailyStats(dateString) {
    const targetDate = dateString || getLocalDateString();
    const tickets = getAllTickets();

    const ticketsForDate = tickets.filter(t => getLocalDateString(t.createdAt) === targetDate);

    // Group counts for selected date
    const stats = {
      date: targetDate,
      totalToday: ticketsForDate.length,
      pendiente: ticketsForDate.filter(t => t.status === 'pendiente').length,
      en_proceso: ticketsForDate.filter(t => t.status === 'en_proceso').length,
      resuelto: ticketsForDate.filter(t => t.status === 'resuelto').length,
      cerrado: ticketsForDate.filter(t => t.status === 'cerrado').length,
      // Global metrics
      allTimeTotal: tickets.length,
      allTimeOpen: tickets.filter(t => t.status !== 'cerrado').length
    };

    return stats;
  }
};

module.exports = db;
