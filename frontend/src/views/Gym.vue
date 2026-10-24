<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'

const team = ref(null)
const loading = ref(true)
onMounted(async () => {
  try { team.value = await api.get('/gym/team') } finally { loading.value = false }
})
</script>

<template>
  <Scaffold title="Gym / Team" back>
    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-surface-sunk mt-4"></div>
    <EmptyState v-else-if="!team" icon="team" title="No team" subtitle="You're not part of a gym team yet." />
    <template v-else>
      <div class="card p-5 mt-4">
        <p class="text-xs text-ink-soft">Team</p>
        <p class="text-lg font-semibold">{{ team.name }}</p>
        <p class="text-sm text-ink-soft mt-1">{{ team.members.length }} members · {{ team.roles.length }} roles</p>
      </div>

      <p class="section-label mt-6 mb-2 px-1">Members</p>
      <div class="card divide-y divide-line">
        <div v-for="m in team.members" :key="m.id" class="flex items-center gap-3 p-4">
          <Avatar :name="m.full_name" :size="40" />
          <div class="flex-1 min-w-0"><p class="font-medium truncate">{{ m.full_name }}</p>
            <p class="text-xs text-ink-soft">{{ m.team_role || (m.is_paying_client ? 'Paying client' : m.user_role) }}</p></div>
          <span v-if="m.is_paying_client" class="pill text-ok border-ok/30 bg-ok/10">Paying</span>
        </div>
      </div>

      <template v-if="team.join_requests.length">
        <p class="section-label mt-6 mb-2 px-1">Join requests</p>
        <div class="card divide-y divide-line">
          <div v-for="r in team.join_requests" :key="r.id" class="flex items-center gap-3 p-4">
            <Avatar :name="r.full_name" :size="40" />
            <p class="flex-1 font-medium">{{ r.full_name }}</p>
            <span class="pill text-warn border-warn/30 bg-warn/10">Pending</span>
          </div>
        </div>
      </template>

      <p class="section-label mt-6 mb-2 px-1">Roles</p>
      <div class="card divide-y divide-line">
        <div v-for="role in team.roles" :key="role.id" class="p-4">
          <p class="font-medium">{{ role.name }}</p>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <span v-if="role.can_manage_clients" class="pill text-ink-soft border-line bg-surface-sunk">Clients</span>
            <span v-if="role.can_manage_programs" class="pill text-ink-soft border-line bg-surface-sunk">Programs</span>
            <span v-if="role.can_manage_billing" class="pill text-ink-soft border-line bg-surface-sunk">Billing</span>
          </div>
        </div>
      </div>
    </template>
  </Scaffold>
</template>
