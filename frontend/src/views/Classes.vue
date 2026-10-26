<script setup>
import { ref, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../lib/api.js'
import { niceDate } from '../lib/format.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const cached = api.cached('/classes')
const data = ref(
  cached || { sessions: [], checked_in_today: false, can_self_book: true, can_self_checkin: true },
)
const loading = ref(!cached)
const busyId = ref(null)
const checkingIn = ref(false)
const filter = ref('all') // 'all' | 'today' | 'booked'
const err = ref('')
const todayIso = dayjs().format('YYYY-MM-DD')

async function load() {
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

const filteredSessions = computed(() => {
  const list = data.value.sessions || []
  if (filter.value === 'today') {
    return list.filter((s) => String(s.session_date || '').slice(0, 10) === todayIso)
  }
  if (filter.value === 'booked') {
    return list.filter((s) => Boolean(s.my_booking))
  }
  return list
})

async function toggleBook(s) {
  haptics.medium()
  busyId.value = s.id
  err.value = ''
  try {
    if (s.my_booking && s.my_booking.status === 'Booked') {
      await api.post(`/classes/${s.id}/cancel`, { booking: s.my_booking.name })
      haptics.warning()
    } else {
      await api.post(`/classes/${s.id}/book`)
      haptics.success()
    }
    await load()
  } catch (e) {
    err.value = e.message || 'Action failed'
    haptics.error()
  } finally {
    busyId.value = null
  }
}

async function selfCheckIn(sessionId = null) {
  haptics.medium()
  checkingIn.value = true
  err.value = ''
  try {
    await api.post('/checkin', { session: sessionId })
    haptics.success()
    await load()
  } catch (e) {
    err.value = e.message || 'Check-in failed'
    haptics.error()
  } finally {
    checkingIn.value = false
  }
}

function capacityPct(s) {
  if (!s.capacity) return 0
  return Math.min(100, Math.round(((s.booked_count || 0) / s.capacity) * 100))
}
</script>

<template>
  <Scaffold :title="t('train.classesTitle')" tab :onRefresh="load">
    <!-- Self Check-in Hero Banner -->
    <div
      v-if="data.can_self_checkin"
      class="card p-4 mt-3 flex items-center justify-between gap-3 border-l-4"
      :class="data.checked_in_today ? 'border-l-ok' : 'border-l-brand-600'"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-11 h-11 rounded-2xl grid place-items-center shrink-0"
          :class="
            data.checked_in_today
              ? 'bg-ok/15 text-ok'
              : 'bg-brand-50 text-brand-700'
          "
        >
          <Icon :name="data.checked_in_today ? 'check' : 'qr'" :size="21" />
        </div>
        <div class="min-w-0">
          <p class="font-bold text-ink truncate">{{ t('classes.floorCheckIn') }}</p>
          <p class="text-xs text-ink-soft mt-0.5 line-clamp-2">
            {{
              data.checked_in_today
                ? 'Attendance verified for today’s training session.'
                : t('classes.floorSub')
            }}
          </p>
        </div>
      </div>

      <button
        type="button"
        class="btn-primary !min-h-[44px] !px-4 text-xs shrink-0"
        :class="data.checked_in_today ? '!bg-ok' : ''"
        :disabled="checkingIn || data.checked_in_today"
        @click="selfCheckIn()"
      >
        <Icon name="check" :size="16" />
        {{
          data.checked_in_today
            ? t('train.checkedIn')
            : checkingIn
              ? 'Checking in…'
              : t('classes.checkInNow')
        }}
      </button>
    </div>

    <!-- Filter Segment Pills -->
    <div class="flex gap-2 mt-4 mb-3 overflow-x-auto no-scrollbar">
      <button
        v-for="tabOpt in [
          { key: 'all', label: t('classes.filterAll') },
          { key: 'today', label: t('classes.filterToday') },
          { key: 'booked', label: t('classes.filterBooked') },
        ]"
        :key="tabOpt.key"
        type="button"
        class="min-h-[40px] px-4 rounded-full text-xs font-semibold border transition shrink-0"
        :class="
          filter === tabOpt.key
            ? 'bg-ink text-surface border-ink shadow-sm'
            : 'bg-surface border-line text-ink-soft'
        "
        @click="haptics.select(); filter = tabOpt.key"
      >
        {{ tabOpt.label }}
      </button>
    </div>

    <p v-if="err" class="text-bad text-sm my-2 px-1 font-medium">{{ err }}</p>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card p-4 h-28 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState
      v-else-if="!filteredSessions.length"
      icon="calendar"
      title="No matching classes"
      subtitle="Try switching the filter above or check back for newly published sessions."
    />

    <div v-else class="space-y-3">
      <article v-for="s in filteredSessions" :key="s.id" class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ backgroundColor: s.color || '#F23D46' }"
              ></span>
              <h3 class="font-bold text-ink text-base truncate">{{ s.title }}</h3>
            </div>
            <p class="text-xs font-medium text-ink-soft mt-1 tabular-nums">
              {{ niceDate(s.session_date) }} · {{ String(s.start_time || '').slice(0, 5) }}
              <template v-if="s.end_time">– {{ String(s.end_time).slice(0, 5) }}</template>
              <template v-if="s.room"> · {{ s.room }}</template>
            </p>
            <p v-if="s.coach_name" class="text-xs text-ink-mute mt-0.5">
              Coach: <span class="text-ink-soft font-medium">{{ s.coach_name }}</span>
            </p>
          </div>
          <StatusPill
            v-if="s.my_booking"
            :status="s.my_booking.status === 'Attended' ? 'done' : 'active'"
          />
        </div>

        <!-- Capacity Progress Bar -->
        <div v-if="s.capacity" class="mt-3">
          <div class="h-1.5 w-full rounded-full bg-surface-sunk overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="s.spots_left <= 2 ? 'bg-warn' : 'bg-brand-600'"
              :style="{ width: `${capacityPct(s)}%` }"
            ></div>
          </div>
        </div>

        <div class="flex items-center justify-between mt-3 pt-3 border-t border-line/70 gap-2">
          <span class="text-xs font-medium text-ink-mute tabular-nums">
            <strong class="text-ink">{{ s.booked_count || 0 }}</strong>
            <template v-if="s.capacity"> / {{ s.capacity }}</template> booked
            <template v-if="s.capacity">
              ·
              <span :class="s.spots_left <= 2 ? 'text-warn font-semibold' : ''">
                {{ s.spots_left }} {{ t('classes.spotsLeft') }}
              </span>
            </template>
          </span>

          <div class="flex gap-2">
            <button
              v-if="data.can_self_checkin && s.my_booking?.status === 'Booked'"
              type="button"
              class="btn-soft !min-h-[42px] !px-3.5 text-xs"
              :disabled="checkingIn"
              @click="selfCheckIn(s.id)"
            >
              <Icon name="check" :size="15" />
              {{ t('train.checkInFloor') }}
            </button>

            <button
              v-if="data.can_self_book && s.my_booking?.status !== 'Attended'"
              type="button"
              :class="
                s.my_booking?.status === 'Booked'
                  ? 'btn-outline !min-h-[42px] !px-4 text-xs'
                  : 'btn-primary !min-h-[42px] !px-4 text-xs'
              "
              :disabled="busyId === s.id || (!s.my_booking && s.spots_left <= 0)"
              @click="toggleBook(s)"
            >
              {{
                busyId === s.id
                  ? 'Saving…'
                  : s.my_booking?.status === 'Booked'
                    ? t('classes.cancelSpot')
                    : s.spots_left <= 0
                      ? t('classes.full')
                      : t('classes.bookSpot')
              }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </Scaffold>
</template>
