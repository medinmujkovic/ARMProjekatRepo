# 1. Faza za build aplikacije (koristi .NET SDK)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Kopiranje projektnog fajla i povlačenje biblioteka
COPY *.csproj ./
RUN dotnet restore

# Kopiranje ostatka koda i objava (Publish) aplikacije
COPY . ./
RUN dotnet publish -c Release -o out

# 2. Faza za pokretanje (koristi manju, runtime sliku)
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/out .

# Izlaganje porta na kojem .NET aplikacije obično slušaju (8080 za .NET 8)
EXPOSE 8080

# Pokretanje aplikacije (zamijeni sa tačnim nazivom tvog .csproj ako treba)
ENTRYPOINT ["dotnet", "SudskiSistemApp.dll"]