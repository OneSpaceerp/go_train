<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api.js'
import { setSession, applyTheme } from '../lib/session.js'

const router = useRouter()
const mode = ref('login') // 'login' | 'register'
const email = ref('heba@gotrain.app')
const password = ref('gotrain')
const fullName = ref('')
const role = ref('client')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const path = mode.value === 'login' ? '/auth/login' : '/auth/register'
    const body = mode.value === 'login'
      ? { email: email.value, password: password.value }
      : { email: email.value, password: password.value, full_name: fullName.value, role: role.value }
    const { token, user } = await api.post(path, body)
    setSession(token, user)
    applyTheme(user.theme)
    router.replace(user.role === 'coach' ? '/coach' : '/')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
const demo = (e) => { email.value = e; password.value = 'gotrain'; mode.value = 'login' }
</script>

<template>
  <div class="min-h-full flex flex-col justify-center px-6 py-10 mx-auto w-full max-w-[26rem]">
    <div class="flex flex-col items-center mb-8">
      <img src="/logo.png" alt="" class="w-20 h-20 rounded-[1.25rem] shadow-card" />
      <h1 class="mt-4 text-2xl font-semibold">Go Train</h1>
      <p class="text-ink-soft text-sm mt-1">Train. Track. Progress.</p>
    </div>

    <form class="card p-5 space-y-3" @submit.prevent="submit">
      <input v-if="mode === 'register'" v-model="fullName" class="field" placeholder="Full name" required />
      <input v-model="email" type="email" class="field" placeholder="Email" autocomplete="username" required />
      <input v-model="password" type="password" class="field" placeholder="Password" autocomplete="current-password" required />

      <div v-if="mode === 'register'" class="flex gap-2">
        <button type="button" class="flex-1 h-11 rounded-field border text-sm font-medium transition"
          :class="role === 'client' ? 'border-brand-600 text-brand-700 bg-brand-50' : 'border-field text-ink-soft'"
          @click="role = 'client'">I'm an athlete</button>
        <button type="button" class="flex-1 h-11 rounded-field border text-sm font-medium transition"
          :class="role === 'coach' ? 'border-brand-600 text-brand-700 bg-brand-50' : 'border-field text-ink-soft'"
          @click="role = 'coach'">I'm a coach</button>
      </div>

      <p v-if="error" class="text-bad text-sm">{{ error }}</p>
      <button class="btn-primary w-full" :disabled="busy">
        {{ busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account' }}
      </button>
    </form>

    <button class="mt-4 text-sm text-ink-soft text-center" @click="mode = mode === 'login' ? 'register' : 'login'">
      {{ mode === 'login' ? "New here? Create an account" : 'Have an account? Sign in' }}
    </button>

    <div class="mt-8 text-center">
      <p class="section-label mb-2">Demo accounts (password: gotrain)</p>
      <div class="flex justify-center gap-2 flex-wrap">
        <button class="btn-soft" @click="demo('heba@gotrain.app')">Athlete</button>
        <button class="btn-soft" @click="demo('coach@gotrain.app')">Coach</button>
      </div>
    </div>
  </div>
</template>
