<script setup>
import { ref, computed, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { money } from '../lib/format.js'
import { isCoach } from '../lib/session.js'
import StatusPill from '../components/StatusPill.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { swipeHandlers } from '../lib/gestures.js'
import { haptics } from '../lib/haptics.js'
import { isRtl } from '../lib/i18n.js'

const listings = ref([])
const purchases = ref([])
const sales = ref([])
const tab = ref('browse')
const loading = ref(true)
const busyId = ref(null)
const error = ref('')
const coach = isCoach()

onMounted(async () => {
  try {
    const reqs = [api.get('/marketplace'), api.get('/marketplace/purchases')]
    if (coach) reqs.push(api.get('/marketplace/sales'))
    const [l, p, s] = await Promise.all(reqs)
    listings.value = l; purchases.value = p; sales.value = s || []
  } catch (err) {
    error.value = err?.message || 'Could not load the marketplace'
  } finally { loading.value = false }
})

// Free programs activate immediately; paid ones become a Pending request
// that the gym activates once payment is taken.
async function buy(listing) {
  busyId.value = listing.id
  error.value = ''
  try {
    const res = await api.post(`/marketplace/${listing.id}/buy`)
    listing.my_status = res?.status || 'Active'
    purchases.value = await api.get('/marketplace/purchases')
    tab.value = 'purchases'
  } catch (err) {
    error.value = err?.message || 'Could not enroll'
  } finally {
    busyId.value = null
  }
}
const tabs = coach ? ['browse', 'purchases', 'sales'] : ['browse', 'purchases']
const LABELS = { browse: 'Browse', purchases: 'Purchases', sales: 'Sales' }
const segments = computed(() => tabs.map((value) => ({ value, label: LABELS[value] })))

// Segment pages slide in from the side you swiped (or the segment you tapped)
const pageMotion = ref('seg-next')
function setTab(next) {
  pageMotion.value = tabs.indexOf(next) > tabs.indexOf(tab.value) ? 'seg-next' : 'seg-prev'
  tab.value = next
}
const swipe = swipeHandlers((dir) => {
  const forward = (dir === 'left') !== isRtl.value
  const next = tabs[tabs.indexOf(tab.value) + (forward ? 1 : -1)]
  if (next) {
    haptics.select()
    setTab(next)
  }
})
</script>

<template>
  <Scaffold title="Marketplace" back>
    <SegmentedControl :model-value="tab" :options="segments" label="Marketplace sections" class="mt-3" @update:model-value="setTab" />

    <p v-if="error" class="text-bad text-sm mt-3 px-1" role="alert">{{ error }}</p>
    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-surface-sunk mt-4"></div>

    <div v-else class="seg-pages" @touchstart.passive="swipe.onTouchstart" @touchmove="swipe.onTouchmove" @touchend.passive="swipe.onTouchend">
     <Transition :name="pageMotion" mode="out-in">
      <div v-if="tab === 'browse'" key="browse" class="pt-4 space-y-3">
        <div v-for="l in listings" :key="l.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div><p class="font-semibold">{{ l.title }}</p>
              <p class="text-sm text-ink-soft">by {{ l.seller_name }}</p></div>
            <span class="font-bold">{{ money(l.price_cents, l.currency) }}</span>
          </div>
          <p class="text-sm text-ink-soft mt-2">{{ l.summary }}</p>
          <StatusPill v-if="l.my_status === 'Active' || l.my_status === 'Pending'" :status="l.my_status" class="mt-3" />
          <button v-else class="btn-soft mt-3" :disabled="busyId === l.id" @click="buy(l)">
            {{ l.price_cents > 0 ? 'Request enrollment' : 'Enroll free' }}
          </button>
          <p v-if="l.price_cents > 0 && !l.my_status" class="text-xs text-ink-mute mt-2">
            Your gym will confirm payment before the program unlocks.
          </p>
        </div>
      </div>

      <div v-else-if="tab === 'purchases'" key="purchases">
        <EmptyState v-if="!purchases.length" icon="store" title="No purchases yet" />
        <div v-else class="pt-4 space-y-2">
          <div v-for="p in purchases" :key="p.id" class="card p-4 flex justify-between items-center">
            <div><p class="font-medium">{{ p.title }}</p>
              <span class="text-sm text-ink-soft">{{ money(p.price_cents, p.currency) }}</span></div>
            <StatusPill :status="p.status" />
          </div>
        </div>
      </div>

      <div v-else key="sales">
        <EmptyState v-if="!sales.length" icon="store" title="No sales yet" />
        <div v-else class="pt-4 space-y-2">
          <div v-for="s in sales" :key="s.id" class="card p-4 flex justify-between items-center">
            <div><p class="font-medium">{{ s.title }}</p><p class="text-xs text-ink-soft">{{ s.buyer_name }}</p></div>
            <span class="font-bold text-ok">{{ money(s.price_cents, s.currency) }}</span>
          </div>
        </div>
      </div>
     </Transition>
    </div>
  </Scaffold>
</template>
