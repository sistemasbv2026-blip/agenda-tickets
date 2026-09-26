// Common helper utilities for Agenda & Ticket System

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const now = new Date();
  const past = new Date(isoString);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHour < 24) return `Hace ${diffHour} h`;
  if (diffDay === 1) return 'Ayer';
  return `Hace ${diffDay} días`;
}

function getStatusBadge(status) {
  const statusLabels = {
    pendiente: 'Pendiente',
    en_proceso: 'En Proceso',
    resuelto: 'Resuelto',
    cerrado: 'Cerrado'
  };
  const label = statusLabels[status] || status;
  return `<span class="badge badge-${status}">${label}</span>`;
}

function getPriorityBadge(priority) {
  const map = {
    urgente: { label: '🔥 Urgente', cls: 'priority-urgente' },
    alta: { label: '⚡ Alta', cls: 'priority-alta' },
    media: { label: '🔹 Media', cls: 'priority-media' },
    baja: { label: '🟢 Baja', cls: 'priority-baja' }
  };
  const item = map[priority] || { label: priority, cls: 'priority-media' };
  return `<span class="badge ${item.cls}">${item.label}</span>`;
}

function copyToClipboard(text, successMessage = 'Copiado al portapapeles') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMessage, 'success');
  }).catch(() => {
    // Fallback for older browsers
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(successMessage, 'success');
  });
}
