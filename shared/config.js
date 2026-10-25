// ゲーム定数。サーバーとクライアントで共有する。
// 座標はワールド単位(マット上の1マス = 1)。時間は秒。
(function (root) {
  const CONFIG = {
    TICK_HZ: 20,              // サーバー更新回数/秒
    INTERP_DELAY: 100,        // クライアント補間の遅延(ms)

    MAP: { W: 16, H: 24 },    // 遊べる範囲(x: 0..W, y: 0..H)

    ROUNDS: 4,
    ROUND_TIME: 180,          // 1ラウンドの制限時間
    COUNTDOWN: 3,             // ラウンド開始前
    INTERMISSION: 7,          // ラウンド間の集計表示
    MATCH_WAIT: 30,           // ランダムマッチで人を待つ秒数(過ぎたらボットで埋めて開始)

    BLOCKS: 12,               // 1ラウンドの資材数
    BOAT_CAPACITY: 2,         // 船1隻が同時に積める数

    BOAT: {
      radius: 0.55,
      speed: 2.5,
      accel: 7,
      turn: 9,                // 旋回速度(rad/s)
      loadSlow: 0.03,         // 積み荷1個ごとの減速率
      laneMul: 1.3,           // 航路(太い格子線)の上
      vortexMul: 0.65,        // 渦の中
      dashMul: 1.9,
      dashTime: 1.1,
      dashCd: 4,
      protectTime: 3.5,
      protectCd: 10,
      pickInterval: 0.6,
      pickDelay: 1.0,         // 落ちた資材を拾い直せるまで
      pickRange: 1.0,
      deliverInterval: 0.5,
      deliverRange: 1.0,
    },

    SHARK: {
      radius: 0.6,
      speed: 2.5,
      accel: 6,
      turn: 7,
      vortexMul: 1.3,         // 渦の中
      chargeWind: 0.4,        // 突進前の溜め
      chargeTime: 0.34,
      chargeSpeed: 11,
      chargeCd: 4.5,
      fanMul: 1.35,           // ねらい場(扇形)の中での突進強化
      diveTime: 4,
      diveCd: 10,
      biteCd: 1.3,
      biteRecoil: 0.4,        // 噛みつき直後の速度倍率
    },

    HIT: {
      biteStun: 0.35,
      chargeStun: 0.6,
      immune: 2.4,            // 被弾後の無敵時間(この間はサメをすり抜ける)
      biteKnock: 3,
      chargeKnock: 6,
      protectKnock: 2,
      caseStun: 0.8,          // 保護中の船にぶつかったサメが動けない時間
      chargeDrop: 2,          // 突進で落とす数
      dropMin: 1.5,           // 落ちた資材が飛ぶ距離
      dropMax: 3.0,
      spin: 14,               // 弾かれたときの回転速度(rad/s)
    },

    SCORE: {
      perDelivered: 1,
      allBonus: 3,
      timeBonusMax: 2,        // 残り時間の割合 x この値(四捨五入)
      perDropped: 1,          // 落とさせた資材1個につき(同じ資材はラウンド中1回まで)
      defendBonus: 3,
      drawPoints: 6,          // 引き分けラウンドで両チームに与える点
    },

    TERRAIN: {
      gridEvery: 1,
      laneEvery: 4,
      laneHalfWidth: 0.35,
      vortex: { x: 8, y: 12, r: 4.2 },
      fans: [
        { x: 0, y: 0, r: 9, a0: 0, a1: 90 },
        { x: 16, y: 24, r: 9, a0: 180, a1: 270 },
      ],
      zone: 4.0,              // 積み場・港の目盛り帯の大きさ
    },

    PILE: { x: 0.9, y: 21.7, cols: 4, rows: 3, gap: 0.62 },
    TRAY: { x0: 13.3, y0: 0.35, x1: 15.75, y1: 2.35, cols: 4, rows: 3 },

    // 机の小物(障害物)。箱で当たり判定。
    OBSTACLES: [
      { kind: 'pencil', x0: 6.6, y0: 6.2, x1: 13.6, y1: 6.8 },
      { kind: 'eraser', x0: 4.6, y0: 15.4, x1: 7.1, y1: 16.8 },
      { kind: 'clip', x0: 10.4, y0: 13.8, x1: 13.2, y1: 15.0 },
      { kind: 'eraser2', x0: 1.8, y0: 7.2, x1: 3.1, y1: 9.5 },
    ],

    SPAWN: {
      boat: [[3.4, 20.4], [2.0, 19.2]],
      shark: [[3.6, 3.6], [12.6, 20.2]],
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(this);
