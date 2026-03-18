import { login, signup } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const resolvedParams = await searchParams

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 shadow-md rounded-xl">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-900">Entrar no CRM</h1>
        
        {resolvedParams?.message && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
            {resolvedParams.message}
          </div>
        )}

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">E-mail</label>
            <input 
              id="email"
              name="email" 
              type="email" 
              required 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">Senha</label>
            <input 
              id="password"
              name="password" 
              type="password" 
              minLength={6}
              required 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-2 mt-4">
            <Button formAction={login} className="w-full" type="submit">Entrar</Button>
            <Button formAction={signup} variant="outline" className="w-full" type="submit">Criar conta</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
