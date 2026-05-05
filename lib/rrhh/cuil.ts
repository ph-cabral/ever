/**
 * Calcula el CUIL a partir del DNI y sexo.
 * Formato salida: XX-XXXXXXXX-X
 *
 * Prefijos:
 *  - Masculino: 20
 *  - Femenino:  27
 *  - Indistinto/X: 23 (también usado para casos especiales)
 *
 * Verificador: módulo 11 sobre los 10 dígitos previos con coeficientes
 *   [5,4,3,2,7,6,5,4,3,2]. Si resto = 0 → 0; si resto = 1 → caso especial
 *   (se cambia prefijo a 23 y se recalcula; si vuelve a dar 1 → 9).
 */
export function calcularCuil(dni: string, sexo: "M" | "F" | "X"): string | null {
  const dniLimpio = dni.replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(dniLimpio)) return null;

  const dniPad = dniLimpio.padStart(8, "0");
  let prefijo = sexo === "M" ? "20" : sexo === "F" ? "27" : "23";

  const calcVerificador = (pref: string, dni8: string): number => {
    const base = pref + dni8; // 10 dígitos
    const coef = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = base
      .split("")
      .reduce((acc, d, i) => acc + parseInt(d, 10) * coef[i], 0);
    const resto = suma % 11;
    if (resto === 0) return 0;
    return 11 - resto;
  };

  let v = calcVerificador(prefijo, dniPad);

  // Caso especial: verificador 10 → cambiar a prefijo 23 y verificador 9
  if (v === 10) {
    prefijo = "23";
    v = 9;
  }

  return `${prefijo}-${dniPad}-${v}`;
}
