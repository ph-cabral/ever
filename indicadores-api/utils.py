import pandas as pd
import numpy as np
from datetime import date

BASE_DATE = date(1800, 12, 28)
BASE_TS   = pd.Timestamp("1800-12-28")

def hhmm_to_seconds(hhmm_series: pd.Series) -> pd.Series:
    """
    Convierte entero HHMM a segundos del día.
    1430 → 14*3600 + 30*60 = 52200
    """
    hhmm = pd.to_numeric(hhmm_series, errors='coerce').fillna(0).astype(int)
    horas   = hhmm // 100
    minutos = hhmm % 100
    return horas * 3600 + minutos * 60

def fecha_int_to_timestamp(fecha_series: pd.Series, hora_series: pd.Series) -> pd.Series:
    """
    Convierte FechaXXX (int días desde 1800-12-28) + HoraXXX (HHMM int)
    a pd.Timestamp.
    Retorna NaT donde fecha <= 0.
    """
    fecha = pd.to_numeric(fecha_series, errors='coerce')
    segundos = hhmm_to_seconds(hora_series)

    ts = BASE_TS + pd.to_timedelta(fecha, unit='D') + pd.to_timedelta(segundos, unit='s')
    ts[fecha <= 0] = pd.NaT
    return ts

def construir_timestamps(df: pd.DataFrame) -> pd.DataFrame:
    """Agrega columnas ts_* al dataframe."""
    df['ts_Registro']     = fecha_int_to_timestamp(df['FechaPedido'],       df['HoraRegistracion'])
    df['ts_Suspendido']   = fecha_int_to_timestamp(df['FechaSuspendido'],   df['HoraSuspendido'])
    df['ts_Confirmacion'] = fecha_int_to_timestamp(df['FechaConfirmacion'], df['HoraConfirmacion'])
    df['ts_Armado']       = fecha_int_to_timestamp(df['FechaArmado'],       df['HoraArmado'])
    df['ts_Cierre']       = fecha_int_to_timestamp(df['FechaCierre'],       df['HoraCierre'])
    return df

def calcular_tiempos(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula tiempos en minutos entre etapas.
    Valores negativos o NaN quedan como NaN (se excluyen de promedios).
    """
    def diff_min(a: pd.Series, b: pd.Series) -> pd.Series:
        delta = (b - a).dt.total_seconds() / 60
        delta[delta < 0] = np.nan   # dato sucio → excluir
        return delta.round(2)

    df['Tiempo_Reg_Suspension_min']    = diff_min(df['ts_Registro'],     df['ts_Suspendido'])
    df['Tiempo_Susp_Confirmacion_min'] = diff_min(df['ts_Suspendido'],   df['ts_Confirmacion'])
    df['Tiempo_Reg_Confirmacion_min']  = diff_min(df['ts_Registro'],     df['ts_Confirmacion'])
    df['Tiempo_Confirm_Armado_min']    = diff_min(df['ts_Confirmacion'], df['ts_Armado'])
    df['Tiempo_Armado_Cierre_min']     = diff_min(df['ts_Armado'],       df['ts_Cierre'])
    df['Tiempo_Confirm_Cierre_min']    = diff_min(df['ts_Confirmacion'], df['ts_Cierre'])

    return df

COLUMNAS_TIEMPO = [
    'Tiempo_Reg_Suspension_min',
    'Tiempo_Susp_Confirmacion_min',
    'Tiempo_Reg_Confirmacion_min',
    'Tiempo_Confirm_Armado_min',
    'Tiempo_Armado_Cierre_min',
    'Tiempo_Confirm_Cierre_min',
]

