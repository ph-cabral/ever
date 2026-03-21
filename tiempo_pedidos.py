import pandas as pd
import numpy as np
from matplotlib import pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import matplotlib.ticker as mticker
import matplotlib.patches as mpatches
import os
import glob
import warnings
import json
from io import BytesIO
import base64

# Configurar backend no interactivo para evitar colgarse (descomentar si es necesario)
# plt.switch_backend('Agg')  

warnings.filterwarnings('ignore')

def limpiar_columnas_tiempo(df):
    """Convierte columnas de tiempo de formato '7,5' (texto) a 7.5 (float)"""
    columnas_tiempo = [
        'Tiempo_Entre_Reg_Suspencion',
        'Tiempo_E_Susp_Confirmacion', 
        'Tiempo_Entre_Reg_Confirmacion',
        'Tiempo_Entre_Confirm_IniArmado',
        'Tiempo_Entre_Armado_Cierre',
        'Tiempo_E_Confirm_Cierre'
    ]

    for col in columnas_tiempo:
        if col in df.columns:
            df[col] = df[col].astype(str)
            df[col] = df[col].str.replace(',', '.', regex=False)
            df[col] = df[col].replace(['nan', 'None', 'null', ''], np.nan)
            df[col] = pd.to_numeric(df[col], errors='coerce')
    return df


def cargar_datos():
    df = pd.read_excel("SITD_Tiempo de pedidos.xlsx")
    df = limpiar_columnas_tiempo(df)
     
    df['FechaRegistracionPedido'] = pd.to_datetime(df['FechaRegistracionPedido'], dayfirst=True, errors='coerce')
    df['año'] = df['FechaRegistracionPedido'].dt.year
    df['mes'] = df['FechaRegistracionPedido'].dt.to_period('M').astype(str)
    df['nombre_mes'] = df['FechaRegistracionPedido'].dt.month.map({
        1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
        5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
        9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
    })
    
    # Filtros para df (usado en métricas mensuales)
    df = df[df['CodComprobante'].str.strip().isin([
        '10 - Pedido MAYORISTA', '100 - PEDIDO MAYORISTA MOSTRADORES',
        '210 - Pedido MOVIL', '310 - PEDIDO WEB'])]
    df = df[df['CodComprobante_Factura'].str.strip().isin(['11 - FACTURA CTA.CTE. MAYORISTA'])]
    df = df[df['Estado'].str.strip().isin(['Facturado', 'Cerrado'])]
    
    # Filtros para df_copy (usado en prioridades/estados)
    df_copy = df[df['CodComprobante'].str.strip().isin([
        '10 - Pedido MAYORISTA', '100 - PEDIDO MAYORISTA MOSTRADORES',
        '210 - Pedido MOVIL', '310 - PEDIDO WEB'])].copy()
    df_copy = df_copy[df_copy['CodComprobante_Factura'].str.strip().isin(['11 - FACTURA CTA.CTE. MAYORISTA'])]
    
    return df, df_copy


def calcular_prioridades(df_copy):
    """Calcula tabla de prioridades para el mes más reciente"""
    mes_reciente = df_copy.sort_values(['nombre_mes'], ascending=False)['nombre_mes'].unique()[0]
    df_prioridades = df_copy[df_copy['nombre_mes'] == mes_reciente]
    
    df_prioridades = df_prioridades.groupby(['Prioridad']).agg({
        'NroMovVenta': 'count',
        'Tiempo_E_Confirm_Cierre': lambda x: round(x.mean(), 2)
    }).reset_index().rename(columns={
        'NroMovVenta': 'cantidad',
        'Tiempo_E_Confirm_Cierre': 'Tiempo Promedio'
    })
 
    return df_prioridades


def calcular_etapa(serie):
    """Calcula promedio (en horas) y count excluyendo valores <= 0"""
    validos = serie[serie >= 0]
    if len(validos) == 0:
        return {'promedio': 0, 'suma': 0, 'count': 0}
    return {
        'promedio': validos.mean(),
        'suma': validos.sum(),
        'count': len(validos)
    }


def calcular_metricas_mensuales(df):
    """Calcula métricas por mes"""
    metricas = []
    
    for nombre_mes, grupo in df.groupby('nombre_mes'):
        total_ops_mes = len(grupo)
        
        etapa1 = calcular_etapa(grupo['Tiempo_Entre_Reg_Confirmacion'])
        etapa2 = calcular_etapa(grupo['Tiempo_Entre_Confirm_IniArmado'])
        etapa3 = calcular_etapa(grupo['Tiempo_Entre_Armado_Cierre'])
        etapa4 = calcular_etapa(grupo['Tiempo_Entre_Reg_Suspencion'])
        etapa5 = calcular_etapa(grupo['Tiempo_E_Susp_Confirmacion'])
        
        metricas.append({
            'nombre_mes': nombre_mes,
            'total_ops_unicas': total_ops_mes,
            'reg_a_conf': etapa1['promedio'], 'count_reg_conf': etapa1['count'],
            'conf_a_arm': etapa2['promedio'], 'count_conf_arm': etapa2['count'],
            'arm_a_cierre': etapa3['promedio'], 'count_arm_cierre': etapa3['count'],
            'reg_a_susp': etapa4['promedio'], 'count_reg_susp': etapa4['count'],
            'susp_a_conf': etapa5['promedio'], 'count_susp_conf': etapa5['count'],
            'total_tiempo_pag1': etapa1['promedio'] + etapa2['promedio'] + etapa3['promedio'],
            'total_tiempo_pag2': etapa4['promedio'] + etapa5['promedio']
        })
    return pd.DataFrame(metricas)

def calcular_metricas_por_prioridad(df):
    
    # Filtrar solo el mes más reciente
    ultimo = df.sort_values(['año', 'mes']).iloc[-1]
    df_mes = df[(df['nombre_mes'] == ultimo['nombre_mes']) & (df['año'] == ultimo['año'])]
    df_mes = df_mes[df_mes['Prioridad'].isin([1, 2, 3])]
    
    metricas = []
    for prioridad, grupo in df_mes.groupby('Prioridad'):
        etapa1 = calcular_etapa(grupo['Tiempo_Entre_Reg_Confirmacion'])
        etapa2 = calcular_etapa(grupo['Tiempo_Entre_Confirm_IniArmado'])
        etapa3 = calcular_etapa(grupo['Tiempo_Entre_Armado_Cierre'])
        etapa4 = calcular_etapa(grupo['Tiempo_Entre_Reg_Suspencion'])
        etapa5 = calcular_etapa(grupo['Tiempo_E_Susp_Confirmacion'])

        metricas.append({
            'nombre_mes': f"Prioridad {int(prioridad)}", 
            'total_ops_unicas': len(grupo),
            'reg_a_conf': etapa1['promedio'], 'count_reg_conf': etapa1['count'],
            'conf_a_arm': etapa2['promedio'], 'count_conf_arm': etapa2['count'],
            'arm_a_cierre': etapa3['promedio'], 'count_arm_cierre': etapa3['count'],
            'reg_a_susp': etapa4['promedio'], 'count_reg_susp': etapa4['count'],
            'susp_a_conf': etapa5['promedio'], 'count_susp_conf': etapa5['count'],
            'total_tiempo_pag1': etapa1['promedio'] + etapa2['promedio'] + etapa3['promedio'],
            'total_tiempo_pag2': etapa4['promedio'] + etapa5['promedio']
        })
    
    return pd.DataFrame(metricas)


def a_hs(valor):
    """Convierte número decimal a formato horas:minutos"""
    if pd.isna(valor) or valor == 0:
        return "0hs"
    h = int(valor)
    m = int((valor - h) * 60)
    return f"{h}hs" if m == 0 else f"{h}:{m:02d}hs"

def graficar_pagina_1(ax, df_metricas):
    x = np.arange(len(df_metricas))
    width = 0.6
    
    reg_conf = df_metricas['reg_a_conf'].values
    conf_arm = df_metricas['conf_a_arm'].values
    arm_cierre = df_metricas['arm_a_cierre'].values
    
    count_reg_conf = df_metricas['count_reg_conf'].values
    count_conf_arm = df_metricas['count_conf_arm'].values  
    count_arm_cierre = df_metricas['count_arm_cierre'].values
    
    # Dibujar barras apiladas
    bars1 = ax.bar(x, reg_conf, width, label='Registro a Confirmación', 
                  color='#FFE066', edgecolor='white', linewidth=0.5)
    bars2 = ax.bar(x, conf_arm, width, bottom=reg_conf, 
                  label='Confirmación a Inicio de Armado',
                  color='#999999', edgecolor='white', linewidth=0.5)
    bars3 = ax.bar(x, arm_cierre, width, bottom=reg_conf + conf_arm,
                  label='Armado a Cierre',
                  color='#D3D3D3', edgecolor='white', linewidth=0.5)
    
    # Etiquetas para cada segmento de barra
    for i in range(len(df_metricas)):
        # Etiqueta Reg->Conf (amarillo, texto negro)
        if reg_conf[i] > 0:
            ax.text(x[i], reg_conf[i]/2, f"{a_hs(reg_conf[i])}", 
                   ha='center', va='center', fontsize=15 , fontweight='bold', color='black')
        
        # Etiqueta Conf->Arm (gris, texto blanco)
        if conf_arm[i] > 0:
            ax.text(x[i], reg_conf[i] + conf_arm[i]/2, f"{a_hs(conf_arm[i])}", 
                   ha='center', va='center', fontsize=15 , fontweight='bold', color='white')
        
        # Etiqueta Arm->Cierre (gris claro, texto negro)
        if arm_cierre[i] > 0:
            ax.text(x[i], reg_conf[i] + conf_arm[i] + arm_cierre[i]/2, f"{a_hs(arm_cierre[i])}", 
                   ha='center', va='center', fontsize=15 , fontweight='bold', color='black')
        
        # Total arriba de todo (formato H:MM)
        altura_total = reg_conf[i] + conf_arm[i] + arm_cierre[i]
        total_tiempo = df_metricas['total_tiempo_pag1'].iloc[i]
        total_ops = df_metricas['total_ops_unicas'].iloc[i]
        if altura_total > 0:
            ax.text(x[i], altura_total * 1.02,
                   f"{a_hs(total_tiempo)}\n{int(total_ops)} ops",
                   ha='center', va='bottom', fontsize=15 , fontweight='bold', color='darkblue')
    
    ax.set_xticks(x)
    ax.set_xticklabels([f"{m}" for m in df_metricas['nombre_mes']], rotation=0, ha='center')
    ax.set_ylabel('Tiempo Promedio (horas)')
    ax.set_title('Tiempos entre Etapas - Registro → Cierre', pad=20, fontsize=15 , fontweight='bold')
    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1), frameon=True)
    
    # Formato del eje Y en H:MM
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, pos: a_hs(x)))
    
    max_y = (reg_conf + conf_arm + arm_cierre).max() * 1.2
    ax.set_ylim(0, max_y if max_y > 0 else 1)
    ax.grid(axis='y', alpha=0.3, linestyle='--')

def graficar_pagina_2(ax, df_metricas):
    x = np.arange(len(df_metricas))
    width = 0.6
    
    reg_susp = df_metricas['reg_a_susp'].values
    susp_conf = df_metricas['susp_a_conf'].values
    count_reg_susp = df_metricas['count_reg_susp'].values
    count_susp_conf = df_metricas['count_susp_conf'].values
    
    # Dibujar barras apiladas
    bars1 = ax.bar(x, reg_susp, width, label='Registro a Suspensión', 
                  color='#FFE066', edgecolor='white')
    bars2 = ax.bar(x, susp_conf, width, bottom=reg_susp,
                  label='Suspensión a Confirmación', 
                  color='#999999', edgecolor='white')
    
    # Etiquetas para cada segmento
    for i in range(len(df_metricas)):
        # Etiqueta Reg->Susp (amarillo, texto negro)
        if reg_susp[i] > 0:
            ax.text(x[i], reg_susp[i]/2, f"{a_hs(reg_susp[i])}", 
                   ha='center', va='center', fontsize=15 , fontweight='bold', color='black')
        
        # Etiqueta Susp->Conf (gris, texto blanco)
        if susp_conf[i] > 0:
            ax.text(x[i], reg_susp[i] + susp_conf[i]/2, f"{a_hs(susp_conf[i])}", 
                   ha='center', va='center', fontsize=15 , fontweight='bold', color='white')
        
        # Total arriba (formato H:MM)
        altura_total = reg_susp[i] + susp_conf[i]
        total_tiempo = df_metricas['total_tiempo_pag2'].iloc[i]
        total_ops = df_metricas['total_ops_unicas'].iloc[i]
        if altura_total > 0:
            ax.text(x[i], altura_total * 1.02,
                   f"{a_hs(total_tiempo)}\n{int(total_ops)} ops",
                   ha='center', va='bottom', fontsize=15 , fontweight='bold', color='darkblue')
    
    ax.set_xticks(x)
    ax.set_xticklabels([f"{m}" for m in df_metricas['nombre_mes']], rotation=0, ha='center')
    ax.set_ylabel('Tiempo Promedio (horas)')
    ax.set_title('Proceso con Suspensión - Registro → Confirmación', pad=20, fontsize=15 , fontweight='bold')
    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1), frameon=True)
    
    # Formato del eje Y en H:MM
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, pos: a_hs(x)))
    
    max_y = (reg_susp + susp_conf).max() * 1.2
    ax.set_ylim(0, max_y if max_y > 0 else 1)
    ax.grid(axis='y', alpha=0.3, linestyle='--')

def fig_to_base64(fig):
    buf = BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

df, df_copy = cargar_datos()

df_metricas = calcular_metricas_mensuales(df)
df_metricas_prio = calcular_metricas_por_prioridad(df)
df_prioridades = calcular_prioridades(df_copy)

    # Al final, reemplaza el bloque comentado
output_data = {
    "metricas": df_metricas.to_dict(orient='records'),
    "metricas_por_prioridad": df_metricas_prio.to_dict(orient='records'),
    "prioridades": df_prioridades.to_dict(orient='records'),
    "mes_reciente": mes_reciente
}

import json, os
output_path = os.environ.get("OUTPUT_JSON", "public/data/tiempos_pedidos.json")
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

