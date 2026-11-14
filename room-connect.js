(() => {
  'use strict';

  const scriptUrl = new URL('./vendor/peerjs-1.5.5.min.js', document.currentScript.src).href;
  const protocol = 'studykaki-room-v1';
  const roomKinds = new Set(['quiet', 'module', 'break']);
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  const identityPattern = /^[0-9a-f]{24}$/;
  const tokenPattern = /^[0-9a-f]{32}$/;
  const avatars = new Set(['terracotta', 'sage', 'indigo', 'gold']);
  const hairColors = new Set(['dark', 'brown', 'blond', 'rose', 'slate']);
  const maxGuests = 5;
  const handshakeTimeout = 15000;
  const heartbeatInterval = 10000;
  const heartbeatTimeout = 45000;
  let peerScript;

  function loadPeer() {
    if (typeof window.Peer === 'function') return Promise.resolve(window.Peer);
    if (peerScript) return peerScript;

    peerScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.referrerPolicy = 'no-referrer';
      const fail = () => {
        clearTimeout(timeout);
        script.remove();
        peerScript = undefined;
        reject(new Error('Room connection library is unavailable.'));
      };
      const timeout = setTimeout(fail, handshakeTimeout);
      script.addEventListener('error', fail, { once: true });
      script.addEventListener('load', () => {
        clearTimeout(timeout);
        if (typeof window.Peer === 'function') resolve(window.Peer);
        else fail();
      }, { once: true });
      document.head.append(script);
    });
    return peerScript;
  }

  function inviteFromLocation() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const room = params.get('room');
    const peer = params.get('peer');
    const key = params.get('key');
    if (!roomKinds.has(room) || !idPattern.test(peer ?? '') || !tokenPattern.test(key ?? '')) return null;
    return { room, peer, key };
  }

  function nonce() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
  }

  async function proof(key, role, challenge, room) {
    const text = new TextEncoder().encode(`${protocol}:${role}:${room}:${key}:${challenge}`);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', text));
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function display(value, limit) {
    if (typeof value !== 'string') return '';
    return Array.from(value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, '').trim()).slice(0, limit).join('');
  }

  function participant(value, id = value?.id) {
    if (typeof id !== 'string' || !identityPattern.test(id)) return null;
    return {
      id,
      name: display(value?.name, 28) || 'Guest',
      avatar: avatars.has(value?.avatar) ? value.avatar : 'sage',
      hair: hairColors.has(value?.hair) ? value.hair : 'dark',
    };
  }

  function connect({ room, identity, onPeers, onStatus }) {
    const invitation = inviteFromLocation();
    const kind = room?.kind;
    const guest = room?.invited === true && invitation?.room === kind;
    const key = guest ? invitation.key : nonce();
    const clients = new Map();
    let currentProfile = participant(identity);
    let peer;
    let host;
    let connected = false;
    let closed = false;
    let deadline;
    let ticker;

    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      clearInterval(ticker);
      for (const client of clients.values()) clearTimeout(client.timeout);
      clients.clear();
      peer?.destroy();
    }

    function fail(message) {
      if (closed) return;
      close();
      onPeers([]);
      onStatus('solo', message);
    }

    function broadcastRoster() {
      if (closed || !connected) return;
      const approved = [...clients.values()].filter(client => client.profile);
      const profiles = approved.map(client => client.profile);
      const roster = [currentProfile, ...profiles];
      for (const client of approved) client.connection.send({ type: 'roster', roster });
      onPeers(profiles);
      onStatus(profiles.length ? 'live' : 'ready', profiles.length ? '' : 'Room ready. Share the invite to study together.');
    }

    function removeClient(client) {
      clearTimeout(client.timeout);
      if (clients.get(client.connection.peer) !== client) return;
      clients.delete(client.connection.peer);
      client.connection.close();
      if (client.profile) broadcastRoster();
    }

    async function receiveGuest(client, message) {
      if (!message || typeof message !== 'object' || closed) return;
      if (client.profile) {
        if (message.type === 'ping') {
          client.lastSeen = Date.now();
          client.connection.send({ type: 'pong' });
        }
        if (message.type === 'profile') {
          client.lastSeen = Date.now();
          client.profile = participant(message.profile, client.profile.id);
          broadcastRoster();
        }
        return;
      }

      if (message.type === 'hello' && !client.challenge && tokenPattern.test(message.challenge ?? '')) {
        client.challenge = nonce();
        const claim = await proof(key, 'host', message.challenge, kind);
        if (!closed && clients.get(client.connection.peer) === client) {
          client.connection.send({ type: 'authenticate', challenge: client.challenge, proof: claim });
        }
        return;
      }

      if (message.type !== 'join' || !client.challenge || client.checking) return;
      client.checking = true;
      const expected = await proof(key, 'guest', client.challenge, kind);
      if (closed || clients.get(client.connection.peer) !== client) return;
      if (message.proof !== expected) {
        removeClient(client);
        return;
      }
      const existing = [...clients.values()].filter(item => item.profile);
      if (existing.length >= maxGuests) {
        client.connection.send({ type: 'full' });
        return;
      }
      const profile = participant(message.profile);
      if (!profile || profile.id === currentProfile.id || existing.some(item => item.profile.id === profile.id)) {
        removeClient(client);
        return;
      }
      clearTimeout(client.timeout);
      client.lastSeen = Date.now();
      client.profile = profile;
      broadcastRoster();
    }

    function acceptGuest(connection) {
      if (closed || clients.size >= maxGuests + 5 || clients.has(connection.peer) || !idPattern.test(connection.peer)) {
        connection.close();
        return;
      }
      const client = { connection, profile: null, lastSeen: Date.now() };
      clients.set(connection.peer, client);
      client.timeout = setTimeout(() => removeClient(client), handshakeTimeout);
      connection.on('data', message => {
        receiveGuest(client, message).catch(() => removeClient(client));
      });
      connection.on('close', () => removeClient(client));
      connection.on('error', () => removeClient(client));
    }

    function connectToHost() {
      host = peer.connect(invitation.peer, { serialization: 'json' });
      const challenge = nonce();
      let authenticating = false;
      let verified = false;
      let lastSeen = Date.now();

      host.on('open', () => host.send({ type: 'hello', challenge }));
      host.on('data', async message => {
        if (!message || typeof message !== 'object' || closed) return;
        try {
          if (!authenticating && message.type === 'authenticate' && tokenPattern.test(message.challenge ?? '')) {
            authenticating = true;
            const expected = await proof(key, 'host', challenge, kind);
            if (message.proof !== expected) {
              fail('This invite could not be verified. Ask the host for a new link.');
              return;
            }
            const claim = await proof(key, 'guest', message.challenge, kind);
            if (closed) return;
            verified = true;
            host.send({ type: 'join', proof: claim, profile: currentProfile });
            return;
          }
          if (!verified) return;
          if (message.type === 'full') {
            fail('This room is full. Ask the host to share another room.');
            return;
          }
          if (message.type === 'pong') lastSeen = Date.now();
          if (message.type !== 'roster' || !Array.isArray(message.roster) || message.roster.length > maxGuests + 1) return;

          const unique = new Map();
          for (const value of message.roster) {
            const profile = participant(value);
            if (profile) unique.set(profile.id, profile);
          }
          if (unique.size < 2 || !unique.delete(currentProfile.id)) return;
          lastSeen = Date.now();
          clearTimeout(deadline);
          connected = true;
          onPeers([...unique.values()]);
          onStatus('live');
        } catch {
          fail('Room connection failed. Open the invite again to retry.');
        }
      });
      host.on('close', () => fail('The host left or the room connection was lost.'));
      host.on('error', () => fail('Could not reach the host. Check that the host has the room open.'));
      ticker = setInterval(() => {
        if (!connected || closed) return;
        if (Date.now() - lastSeen > heartbeatTimeout) fail('The room connection timed out.');
        else if (host.open) host.send({ type: 'ping' });
      }, heartbeatInterval);
    }

    async function start() {
      if (closed) return;
      onStatus('connecting', guest ? 'Connecting to the host…' : 'Opening your room…');
      onPeers([]);
      if (!roomKinds.has(kind) || !crypto.subtle || !currentProfile) {
        fail('Live rooms require a secure browser connection.');
        return;
      }
      try {
        const Peer = await loadPeer();
        if (closed) return;
        deadline = setTimeout(() => fail(guest ? 'No response from the host. Check that the room is still open.' : 'Room service did not respond. Try again.'), handshakeTimeout);
        peer = new Peer({ secure: true, referrerPolicy: 'no-referrer' });
        peer.on('open', () => {
          if (guest) {
            connectToHost();
            return;
          }
          clearTimeout(deadline);
          connected = true;
          broadcastRoster();
          ticker = setInterval(() => {
            for (const client of clients.values()) {
              if (Date.now() - client.lastSeen > heartbeatTimeout) removeClient(client);
            }
          }, heartbeatInterval);
        });
        peer.on('connection', connection => {
          if (guest) connection.close();
          else acceptGuest(connection);
        });
        peer.on('disconnected', () => fail('Signaling disconnected. Open the room again to reconnect.'));
        peer.on('error', error => {
          if (error.type === 'peer-unavailable') {
            if (guest) fail('The host is offline. Ask for a current invite.');
            return;
          }
          if (!guest && connected && error.type === 'webrtc') return;
          fail('Could not connect to the room service. Try again or use the solo timer.');
        });
      } catch {
        fail('Room service is unavailable. Try again or use the solo timer.');
      }
    }

    queueMicrotask(start);
    return {
      close,
      update(nextIdentity) {
        if (closed || !currentProfile) return;
        currentProfile = participant(nextIdentity, currentProfile.id);
        if (!connected || closed) return;
        if (guest && host.open) host.send({ type: 'profile', profile: currentProfile });
        if (!guest) broadcastRoster();
      },
      shareUrl() {
        if (!connected || closed) return null;
        const invite = guest ? invitation : { room: kind, peer: peer.id, key };
        const url = new URL(window.location.pathname, window.location.origin);
        url.hash = new URLSearchParams(invite).toString();
        return url.href;
      },
    };
  }

  window.StudyKakiRoomsTransport = Object.freeze({
    connect,
    invitedRoom: () => inviteFromLocation()?.room ?? null,
  });
})();
