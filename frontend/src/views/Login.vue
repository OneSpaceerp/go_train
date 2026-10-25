<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { initFromBoot } from '../lib/session.js'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    // Frappe's login endpoint sets the session cookie; it allows guest + no CSRF.
    const res = await fetch('/api/method/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ usr: email.value, pwd: password.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Wrong email or password')
    initFromBoot({ user: email.value, full_name: data.full_name || '' })
    router.replace(route.query['redirect-to'] || '/')
  } catch (e) {
    error.value = e.message || 'Could not sign in'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="min-h-full flex flex-col justify-center px-6 py-10 mx-auto w-full max-w-[26rem]">
    <div class="flex flex-col items-center mb-8">
      <img src="/assets/go_train/images/go_train_logo.png" alt="" class="w-20 h-20 rounded-[1.25rem] shadow-card" />
      <h1 class="mt-4 text-2xl font-semibold">Go Train</h1>
      <p class="text-ink-soft text-sm mt-1">Train. Track. Progress.</p>
    </div>

    <form class="card p-5 space-y-3" @submit.prevent="submit">
      <input v-model="email" type="text" class="field" placeholder="Email or username" autocomplete="username" required />
      <input v-model="password" type="password" class="field" placeholder="Password" autocomplete="current-password" required />
      <p v-if="error" class="text-bad text-sm">{{ error }}</p>
      <button class="btn-primary w-full" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
    </form>

    <p class="mt-4 text-center text-xs text-ink-soft">
      Your Go Train member account — ask your gym if you need access.
    </p>
  </div>
</template>
