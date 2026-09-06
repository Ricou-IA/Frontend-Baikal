/**
 * main.jsx - Core RAG Engine
 * ============================================================================
 * Point d'entrée principal de l'application React.
 * Monte l'application dans le DOM.
 * ============================================================================
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Apres un deploiement, un onglet reste sur l'ancienne version et demande un
// module (PDF, page) dont le nom hache n'existe plus : Vite leve alors
// « Failed to fetch dynamically imported module ». On recharge une fois,
// pour reprendre la version en ligne, sans boucler si ca echoue encore.
window.addEventListener('vite:preloadError', (event) => {
  const cle = 'baikal:rechargement-apres-deploiement'
  if (sessionStorage.getItem(cle) === '1') return
  sessionStorage.setItem(cle, '1')
  event.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => sessionStorage.removeItem('baikal:rechargement-apres-deploiement'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
