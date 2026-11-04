<script setup>
const router = useRouter();
</script>

<template>
  <main>
    <h1>Walks across the Peak District</h1>
    <button @click="router.push('/guides')">Trail guides</button>
  </main>
</template>
