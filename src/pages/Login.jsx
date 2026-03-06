import { useState } from 'react'
import { signIn, signUp } from '../lib/supabase'

export default function Login() {
  const [mode, setMode]       = useState('login') // 'login' | 'register'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) setError(error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : error.message)
      } else {
        const { error } = await signUp(email, password)
        if (error) setError(error.message)
        else setSuccess('✅ Cuenta creada. Revisa tu email para confirmar y luego inicia sesión.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center text-gray-950 font-bold text-2xl mx-auto mb-3">F</div>
          <h1 className="text-2xl font-bold text-white">FacturaApp</h1>
          <p className="text-gray-500 text-sm mt-1">Facturación online gratuita</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-lg font-bold text-white mb-5">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm p-3 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-900/30 border border-green-800 text-green-400 text-sm p-3 rounded-lg">
                {success}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
              className="text-sm text-gray-500 hover:text-brand-500 transition-colors"
            >
              {mode === 'login' ? '¿No tienes cuenta? Crear una gratis' : '¿Ya tienes cuenta? Iniciar sesión'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          Gratuito · Sin tarjeta · Datos seguros en Supabase
        </p>
      </div>
    </div>
  )
}
