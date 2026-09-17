// Berekent de prijstabel (producten, levering, toeslag/korting, totaal, btw,
// betaald, saldo) voor één boeking. Verhuisd naar hier (uit routes/boekingen.js)
// zodat ook andere plekken (Dashboard, klantdetail, ...) het echte openstaande
// saldo kunnen tonen i.p.v. enkel de status — een status als "Betaald
// (volledig)" garandeert namelijk niet dat het saldo ook echt op 0 staat (Jonas
// kan bewust een tussenstap overslaan, zie STATUS_FASEN/weergaveStatusLabel in
// public/js/app.js).
const db = require('../db');

const BTW_PERCENTAGE = 21; // prijzen worden verondersteld inclusief BTW te zijn

async function berekenPrijstabel(boekingId) {
  const { rows: boekingRows } = await db.query(
    'SELECT transportkost, toeslag_korting, toeslag_korting_type FROM boekingen WHERE id = $1',
    [boekingId]
  );
  const boeking = boekingRows[0] || {};

  const { rows: prodRows } = await db.query(
    'SELECT COALESCE(SUM(prijs * aantal), 0) AS subtotaal FROM boeking_producten WHERE boeking_id = $1',
    [boekingId]
  );
  const subtotaalProducten = Number(prodRows[0].subtotaal) || 0;
  const transportkost = Number(boeking.transportkost) || 0;
  const toeslagKortingType = boeking.toeslag_korting_type || 'bedrag';
  const toeslagKortingWaarde = Number(boeking.toeslag_korting) || 0;
  // Een percentage wordt toegepast op het productensubtotaal (niet op de
  // transportkost) — een vast bedrag telt zoals voorheen rechtstreeks mee.
  const toeslagKorting = toeslagKortingType === 'percentage'
    ? Math.round(subtotaalProducten * (toeslagKortingWaarde / 100) * 100) / 100
    : toeslagKortingWaarde;
  const totaal = subtotaalProducten + transportkost + toeslagKorting;
  const btwBedrag = Math.round(((totaal * BTW_PERCENTAGE) / (100 + BTW_PERCENTAGE)) * 100) / 100;

  const { rows: betaaldRows } = await db.query(
    'SELECT COALESCE(SUM(bedrag), 0) AS betaald FROM betaling_transacties WHERE boeking_id = $1',
    [boekingId]
  );
  const betaaldBedrag = Number(betaaldRows[0].betaald) || 0;
  const saldoOpenstaand = Math.round((totaal - betaaldBedrag) * 100) / 100;

  return {
    subtotaal_producten: subtotaalProducten,
    transportkost,
    toeslag_korting: toeslagKorting,
    toeslag_korting_waarde: toeslagKortingWaarde,
    toeslag_korting_type: toeslagKortingType,
    totaal,
    btw_percentage: BTW_PERCENTAGE,
    btw_bedrag: btwBedrag,
    betaald_bedrag: betaaldBedrag,
    saldo_openstaand: saldoOpenstaand,
  };
}

module.exports = { berekenPrijstabel };
