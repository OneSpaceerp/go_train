<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../lib/api.js'
import { niceDate } from '../lib/format.js'

const data = ref({ sessions: [], checked_in_today: false, can_self_book: true, can_self_checkin: true })
const loading = ref(true)
const busyId = ref(null)
const checkingIn = ref(false)
const err = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    data.value = await api.get('/classes')
  } catch (e) {
    err.value = e.message || 'Could not load class sessions'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function toggleBook(s) {
  busyId.value = s.id
  err.value = ''
  try {
    if (s.my_booking && s.my_booking.status === 'Booked') {
      await api.post(`/classes/${s.id}/cancel`, { booking: s.my_booking.name })
    } else {
      await api.post(`/classes/${s.id}/book`)
    }
    await load()
  } catch (e) {
    err.value = e.message || 'Action failed'
  } finally {
    busyId.value = null
  }
}

async function selfCheckIn(sessionId = null) {
  checkingIn.value = true
  err.value = ''
  try {
    await api.post('/checkin', { session: sessionId })
    await load()
  } catch (e) {
    err.value = e.message || 'Check-in failed'
  } finally {
    checkingIn.value = false
  }
}
</script>

<template>
  <Scaffold title="Classes & Check-in" back>
    <!-- Self Check-in Banner -->
    <div v-if="data.can_self_checkin" class="card p-4 mt-4 flex items-center justify-between gap-3">
      <div>
        <p class="font-semibold">Gym Floor Check-in</p>
        <p class="text-xs text-ink-soft mt-0.5">
          {{ data.checked_in_today ? 'You are checked in for today.' : 'Arrived at the gym? Tap to check in.' }}
        </p>
      </div>
      <button class="btn-primary !h-10 !px-4 text-sm"
        :class="data.checked_in_today ? '!bg-ok' : ''"
        :disabled="checkingIn || data.checked_in_today"
        @click="selfCheckIn()">
        <Icon name="check" :size="16" />
        {{ data.checked_in_today ? 'Checked in' : checkingIn ? 'Checking in…' : 'Check in now' }}
      </button>
    </div>

    <p v-if="err" class="text-bad text-sm mt-3 px-1">{{ err }}</p>

    <p class="section-label mt-6 mb-2 px-1">Upcoming sessions</p>
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card p-4 h-24 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!data.sessions?.length" icon="calendar" title="No upcoming classes"
      subtitle="Scheduled group classes from your gym will appear here." />

    <div v-else class="space-y-3">
      <div v-for="s in data.sessions" :key="s.id" class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: s.color || '#F23D46' }"></span>
              <p class="font-bold">{{ s.title }}</p>
            </div>
            <p class="text-xs text-ink-soft mt-1">
              {{ niceDate(s.session_date) }} · {{ String(s.start_time || '').slice(0, 5) }}
              <template v-if="s.end_time">– {{ String(s.end_time).slice(0, 5) }}</template>
              <template v-if="s.room"> · {{ s.room }}</template>
            </p>
            <p v-if="s.coach_name" class="text-xs text-ink-soft mt-0.5">Coach: {{ s.coach_name }}</p>
          </div>
          <StatusPill v-if="s.my_booking" :status="s.my_booking.status === 'Attended' ? 'done' : 'active'" />
        </div>

        <div class="flex items-center justify-between mt-3 pt-3 border-t border-line">
          <span class="text-xs text-ink-soft">
            {{ s.booked_count || 0 }}<template v-if="s.capacity"> / {{ s.capacity }}</template> booked
            <template v-if="s.capacity"> ({{ s.spots_left }} left)</template>
          </span>
          <div class="flex gap-2">
            <button v-if="data.can_self_checkin && s.my_booking?.status === 'Booked'"
              class="btn-soft !h-9 !px-3 text-xs"
              :disabled="checkingIn"
              @click="selfCheckIn(s.id)">
              Check in
            </button>
            <button v-if="data.can_self_book && s.my_booking?.status !== 'Attended'"
              :class="s.my_booking?.status === 'Booked' ? 'btn-outline !h-9 !px-3.5 text-xs' : 'btn-primary !h-9 !px-4 text-xs'"
              :disabled="busyId === s.id || (!s.my_booking && s.spots_left <= 0)"
              @click="toggleBook(s)">
              {{ busyId === s.id ? 'Saving…' : s.my_booking?.status === 'Booked' ? 'Cancel spot' : s.spots_left <= 0 ? 'Full' : 'Book spot' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Scaffold>
</template>
