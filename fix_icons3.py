import os

files = [
    'src/pages/Dashboard/Dashboard.jsx',
    'src/pages/MassMessage/MassMessage.jsx',
    'src/pages/Connections/Connections.jsx',
    'src/pages/Agents/Agents.jsx',
    'src/pages/Contacts/Contacts.jsx',
    'src/layouts/DashboardLayout.jsx'
]

mapping = {
    'WarningBox': 'WarningDiamond',
    'Microchip': 'Algorithm',
    'Link as LinkIcon': 'Link as LinkIcon',
    '<LinkIcon ': '<LinkIcon ',
    '<Alert ': '<WarningDiamond '
}

for file in files:
    try:
        with open(file, 'r') as f:
            content = f.read()
            
        content = content.replace('WarningBox', 'WarningDiamond')
        content = content.replace('Microchip', 'Algorithm')
        content = content.replace('<Alert', '<WarningDiamond')
        
        with open(file, 'w') as f:
            f.write(content)
    except FileNotFoundError:
        pass
print("Fixed remaining icons")
