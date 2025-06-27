const myPeer = new Peer(userId, {
  config: {
    'iceServers': [
      { url: 'stun:stun.l.google.com:19302' },
      // Add your TURN server here if needed
    ]
  }
});

