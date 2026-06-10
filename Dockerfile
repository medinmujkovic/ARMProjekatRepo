# 1. Faza: Build aplikacije
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build-env
WORKDIR /app

# Kopiraj i restore projekat
COPY *.csproj ./
RUN dotnet restore

# Kopiraj ostatak koda i buildaj
COPY . ./
RUN dotnet publish -c Release -o out

# 2. Faza: Pokretanje aplikacije
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build-env /app/out .

# Pretpostavimo da aplikacija sluša na portu 5000 unutar kontejnera
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "SudskiSistemApp.dll"]